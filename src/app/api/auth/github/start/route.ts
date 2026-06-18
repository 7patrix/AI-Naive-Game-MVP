import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

const OAUTH_STATE_COOKIE = "github_oauth_state";

export async function GET(request: NextRequest) {
  if (!env.GITHUB_CLIENT_ID) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "GitHub OAuth 尚未配置，请先使用邮箱登录。");
    return NextResponse.redirect(url);
  }

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/"
  });

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GITHUB_REDIRECT_URI);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
