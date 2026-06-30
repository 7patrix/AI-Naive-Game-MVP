import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getValidPasswordResetToken, markPasswordResetTokenUsed } from "@/lib/password-reset";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  confirmPassword: z.string().min(8)
});

function redirectWithError(token: string | null, error: string) {
  const url = new URL("/reset-password", env.APP_URL);
  if (token) {
    url.searchParams.set("token", token);
  }
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    return redirectWithError(String(formData.get("token") ?? ""), "password");
  }

  if (parsed.data.password !== parsed.data.confirmPassword) {
    return redirectWithError(parsed.data.token, "mismatch");
  }

  const tokenResult = await getValidPasswordResetToken(parsed.data.token);

  if (!tokenResult.ok) {
    return redirectWithError(null, "invalid");
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: tokenResult.record.userId },
        data: {
          passwordHash: await hashPassword(parsed.data.password)
        }
      }),
      db.session.deleteMany({
        where: {
          userId: tokenResult.record.userId
        }
      }),
      markPasswordResetTokenUsed(tokenResult.record.id)
    ]);
  } catch (error) {
    console.error("Failed to reset password", error);
    return redirectWithError(parsed.data.token, "failed");
  }

  return NextResponse.redirect(new URL("/login?passwordReset=1", env.APP_URL), { status: 303 });
}
