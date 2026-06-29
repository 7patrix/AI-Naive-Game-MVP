import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { outboundFetch } from "@/lib/outbound-fetch";

const OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_NEXT_COOKIE = "google_oauth_next";

type GoogleTokenPayload = {
  access_token?: string;
  error_description?: string;
};

type GoogleUser = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/login", env.APP_URL);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
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
    return redirectWithError(request, "Google OAuth state 校验失败。");
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return redirectWithError(request, "Google OAuth 尚未配置。");
  }

  const tokenResponse = await outboundFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: env.GOOGLE_REDIRECT_URI
    })
  });
  const tokenPayload = (await tokenResponse.json()) as GoogleTokenPayload;

  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return redirectWithError(request, tokenPayload.error_description ?? "Google 授权失败。");
  }

  const profileResponse = await outboundFetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    },
    cache: "no-store"
  });

  if (!profileResponse.ok) {
    return redirectWithError(request, `Google 用户信息请求失败：${profileResponse.status}`);
  }

  const googleUser = (await profileResponse.json()) as GoogleUser;
  const email = googleUser.email?.toLowerCase();

  if (!googleUser.sub || !email || !googleUser.email_verified) {
    return redirectWithError(request, "Google 账号没有可用的已验证邮箱。");
  }

  const existingAccount = await db.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: googleUser.sub
      }
    },
    include: { user: true }
  });

  if (existingAccount) {
    if (!existingAccount.user.emailVerifiedAt) {
      await db.user.update({
        where: { id: existingAccount.userId },
        data: { emailVerifiedAt: new Date() }
      });
    }

    await createSession(existingAccount.userId);
    return NextResponse.redirect(new URL(nextPath, env.APP_URL), { status: 303 });
  }

  const existingUser = await db.user.findUnique({
    where: { email }
  });
  const verifiedAt = new Date();
  const user =
    existingUser
      ? await db.user.update({
          where: { id: existingUser.id },
          data: {
            emailVerifiedAt: existingUser.emailVerifiedAt ?? verifiedAt,
            avatarUrl: existingUser.avatarUrl ?? googleUser.picture
          }
        })
      : await db.user.create({
      data: {
        email,
        name: googleUser.name ?? email.split("@")[0],
        avatarUrl: googleUser.picture,
        emailVerifiedAt: verifiedAt,
        passwordHash: await hashPassword(randomBytes(32).toString("hex"))
      }
    });

  await db.oAuthAccount.create({
    data: {
      provider: "google",
      providerAccountId: googleUser.sub,
      email,
      userId: user.id
    }
  });

  await createSession(user.id);

  return NextResponse.redirect(new URL(nextPath, env.APP_URL), { status: 303 });
}
