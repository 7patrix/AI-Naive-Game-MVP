import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { env } from "@/lib/env";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(80).optional(),
  password: z.string().min(8)
});

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/register", env.APP_URL);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
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
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    password: formData.get("password")
  });

  if (!parsed.success) {
    return redirectWithError(request, "请输入有效邮箱，并设置至少 8 位密码。");
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await db.user.findUnique({ where: { email } });

  if (existingUser) {
    if (!existingUser.emailVerifiedAt) {
      try {
        await sendVerificationLink(existingUser.id, email);
      } catch (error) {
        console.error("Failed to send verification email", error);
        return redirectWithError(request, "验证邮件发送失败，请稍后重试。");
      }

      return redirectToVerifyEmail(email);
    }

    return redirectWithError(request, "这个邮箱已经注册过。");
  }

  const user = await db.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password)
    }
  });

  try {
    await sendVerificationLink(user.id, email);
  } catch (error) {
    console.error("Failed to send verification email", error);
    return redirectWithError(request, "验证邮件发送失败，请稍后重试。");
  }

  return redirectToVerifyEmail(email);
}
