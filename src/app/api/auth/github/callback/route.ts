import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { outboundFetch } from "@/lib/outbound-fetch";

const OAUTH_STATE_COOKIE = "github_oauth_state";
const OAUTH_NEXT_COOKIE = "github_oauth_next";

type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
};

type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/login", env.APP_URL);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

async function fetchGitHubJson<T>(url: string, token: string) {
  const response = await outboundFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "AI-Arcade-MVP"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`GitHub API 请求失败：${response.status}`);
  }

  return (await response.json()) as T;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const nextPath = cookieStore.get(OAUTH_NEXT_COOKIE)?.value ?? "/create";
  cookieStore.delete(OAUTH_STATE_COOKIE);
  cookieStore.delete(OAUTH_NEXT_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, "GitHub OAuth state 校验失败。");
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return redirectWithError(request, "GitHub OAuth 尚未配置。");
  }

  const tokenResponse = await outboundFetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_REDIRECT_URI
    })
  });

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return redirectWithError(request, tokenPayload.error_description ?? "GitHub 授权失败。");
  }

  const githubUser = await fetchGitHubJson<GitHubUser>(
    "https://api.github.com/user",
    tokenPayload.access_token
  );
  const emails = await fetchGitHubJson<GitHubEmail[]>(
    "https://api.github.com/user/emails",
    tokenPayload.access_token
  );
  const primaryEmail =
    emails.find((email) => email.primary && email.verified)?.email ??
    emails.find((email) => email.verified)?.email ??
    githubUser.email;

  if (!primaryEmail) {
    return redirectWithError(request, "GitHub 账号没有可用的已验证邮箱。");
  }

  const providerAccountId = String(githubUser.id);
  const existingAccount = await db.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "github",
        providerAccountId
      }
    },
    include: { user: true }
  });

  if (existingAccount) {
    await createSession(existingAccount.userId);
    return NextResponse.redirect(new URL(nextPath, env.APP_URL), { status: 303 });
  }

  const existingUser = await db.user.findUnique({
    where: { email: primaryEmail.toLowerCase() }
  });
  const user =
    existingUser ??
    (await db.user.create({
      data: {
        email: primaryEmail.toLowerCase(),
        name: githubUser.name ?? githubUser.login,
        avatarUrl: githubUser.avatar_url,
        passwordHash: await hashPassword(randomBytes(32).toString("hex"))
      }
    }));

  await db.oAuthAccount.create({
    data: {
      provider: "github",
      providerAccountId,
      email: primaryEmail.toLowerCase(),
      userId: user.id
    }
  });

  await createSession(user.id);

  return NextResponse.redirect(new URL(nextPath, env.APP_URL), { status: 303 });
}
