import { Resend } from "resend";
import { env } from "@/lib/env";

type VerificationEmailInput = {
  to: string;
  verifyUrl: string;
};

type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

export async function sendVerificationEmail({ to, verifyUrl }: VerificationEmailInput) {
  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is required to send verification emails in production.");
    }

    console.info(`[dev] Email verification link for ${to}: ${verifyUrl}`);
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "验证你的 AI Native Game 账号邮箱",
    text: `请点击下面的链接完成邮箱验证：\n\n${verifyUrl}\n\n如果不是你本人操作，可以忽略这封邮件。`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h1 style="font-size: 20px;">验证你的 AI Native Game 账号</h1>
        <p>请点击下面的按钮完成邮箱验证，验证后即可使用 Create 生成游戏。</p>
        <p>
          <a href="${verifyUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 12px; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700;">
            验证邮箱
          </a>
        </p>
        <p>如果按钮无法打开，请复制这个链接到浏览器：</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p style="color: #64748b;">如果不是你本人操作，可以忽略这封邮件。</p>
      </div>
    `
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function sendPasswordResetEmail({ to, resetUrl }: PasswordResetEmailInput) {
  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is required to send password reset emails in production.");
    }

    console.info(`[dev] Password reset link for ${to}: ${resetUrl}`);
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "重置你的 AI 游戏工坊账号密码",
    text: `请点击下面的链接重置密码：\n\n${resetUrl}\n\n如果不是你本人操作，可以忽略这封邮件。`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h1 style="font-size: 20px;">重置你的 AI 游戏工坊账号密码</h1>
        <p>请点击下面的按钮设置新密码。这个链接会在 30 分钟后失效。</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 12px; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700;">
            重置密码
          </a>
        </p>
        <p>如果按钮无法打开，请复制这个链接到浏览器：</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color: #64748b;">如果不是你本人操作，可以忽略这封邮件。</p>
      </div>
    `
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}
