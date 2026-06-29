import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyEmailToken } from "@/lib/email-verification";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    const url = new URL("/verify-email", env.APP_URL);
    url.searchParams.set("error", "验证链接缺少 token。");
    return NextResponse.redirect(url, { status: 303 });
  }

  const result = await verifyEmailToken(token);

  if (!result.ok) {
    const url = new URL("/verify-email", env.APP_URL);
    url.searchParams.set("error", result.error);
    return NextResponse.redirect(url, { status: 303 });
  }

  await createSession(result.userId);

  return NextResponse.redirect(new URL("/create", env.APP_URL), { status: 303 });
}
