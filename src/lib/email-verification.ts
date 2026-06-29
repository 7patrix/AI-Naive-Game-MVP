import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createEmailVerificationToken(userId: string, email: string) {
  await db.emailVerificationToken.deleteMany({
    where: {
      userId,
      usedAt: null
    }
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);

  await db.emailVerificationToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      email,
      expiresAt
    }
  });

  return token;
}

export async function verifyEmailToken(token: string) {
  const tokenHash = hashToken(token);
  const record = await db.emailVerificationToken.findUnique({
    where: { tokenHash }
  });

  if (!record || record.usedAt) {
    return { ok: false as const, error: "验证链接无效或已经使用过。" };
  }

  if (record.expiresAt <= new Date()) {
    return { ok: false as const, error: "验证链接已过期，请重新注册或登录后获取新链接。" };
  }

  const verifiedAt = new Date();
  const result = await db.$transaction(async (tx) => {
    const tokenUpdate = await tx.emailVerificationToken.updateMany({
      where: {
        id: record.id,
        usedAt: null
      },
      data: {
        usedAt: verifiedAt
      }
    });

    if (tokenUpdate.count !== 1) {
      return null;
    }

    return tx.user.update({
      where: { id: record.userId },
      data: {
        emailVerifiedAt: verifiedAt
      },
      select: {
        id: true,
        email: true
      }
    });
  });

  if (!result) {
    return { ok: false as const, error: "验证链接无效或已经使用过。" };
  }

  return { ok: true as const, userId: result.id, email: result.email };
}
