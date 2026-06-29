import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { env } from "@/lib/env";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional()
});

function redirectWithError(request: NextRequest, error: string, next?: string) {
  const url = new URL("/login", env.APP_URL);
  url.searchParams.set("error", error);
  if (next) {
    url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url, { status: 303 });
}

function safeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

function redirectToVerifyEmail(email: string) {
  const url = new URL("/verify-email", env.APP_URL);
  url.searchParams.set("email", email);
  return NextResponse.redirect(url, { status: 303 });
}

async function sendVerificationLink(userId: string, email: string) {
  const token = await createEmailVerificationToken(userId, email);
  const verifyUrl = new URL("/api/auth/verify-email", env.APP_URL);
  verifyUrl.searchParams.set("token", token);
  await sendVerificationEmail({ to: email, verifyUrl: verifyUrl.toString() });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined
  });

  if (!parsed.success) {
    return redirectWithError(request, "请输入邮箱和密码。");
  }

  const user = await db.user.findUnique({
    where: {
      email: parsed.data.email.toLowerCase()
    }
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return redirectWithError(request, "邮箱或密码不正确。", parsed.data.next);
  }

  if (!user.emailVerifiedAt) {
    try {
      await sendVerificationLink(user.id, user.email);
    } catch (error) {
      console.error("Failed to send verification email", error);
      return redirectWithError(request, "验证邮件发送失败，请稍后重试。", parsed.data.next);
    }

    return redirectToVerifyEmail(user.email);
  }

  await createSession(user.id);

  return NextResponse.redirect(new URL(safeNextPath(parsed.data.next), env.APP_URL), { status: 303 });
}
