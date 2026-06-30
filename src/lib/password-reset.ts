import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: string, email: string) {
  await db.passwordResetToken.deleteMany({
    where: {
      userId,
      usedAt: null
    }
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await db.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      email,
      expiresAt
    }
  });

  return token;
}

export async function getValidPasswordResetToken(token: string) {
  const record = await db.passwordResetToken.findUnique({
    where: {
      tokenHash: hashToken(token)
    },
    include: {
      user: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });

  if (!record || record.usedAt) {
    return { ok: false as const, error: "重置链接无效或已经使用过。" };
  }

  if (record.expiresAt <= new Date()) {
    return { ok: false as const, error: "重置链接已过期，请重新申请。" };
  }

  return { ok: true as const, record };
}

export function markPasswordResetTokenUsed(tokenId: string) {
  return db.passwordResetToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() }
  });
}
