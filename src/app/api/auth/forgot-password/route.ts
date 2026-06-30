import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { createPasswordResetToken } from "@/lib/password-reset";

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

function redirectToSent() {
  return NextResponse.redirect(new URL("/forgot-password?sent=1", env.APP_URL), { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    return NextResponse.redirect(new URL("/forgot-password?error=invalid", env.APP_URL), { status: 303 });
  }

  const email = parsed.data.email.toLowerCase();
  const user = await db.user.findUnique({
    where: { email }
  });

  // Avoid account enumeration: unknown emails get the same success page.
  if (!user) {
    return redirectToSent();
  }

  try {
    const token = await createPasswordResetToken(user.id, email);
    const resetUrl = new URL("/reset-password", env.APP_URL);
    resetUrl.searchParams.set("token", token);
    await sendPasswordResetEmail({ to: email, resetUrl: resetUrl.toString() });
  } catch (error) {
    console.error("Failed to send password reset email", error);
    return NextResponse.redirect(new URL("/forgot-password?error=send", env.APP_URL), { status: 303 });
  }

  return redirectToSent();
}
