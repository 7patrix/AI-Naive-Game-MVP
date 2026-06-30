import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { uploadObject } from "@/lib/storage";

const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

function redirectToProfile(search: string) {
  return NextResponse.redirect(new URL(`/account/profile${search}`, env.APP_URL), { status: 303 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/account/profile", env.APP_URL), { status: 303 });
  }

  const formData = await request.formData();
  const avatar = formData.get("avatar");

  if (!(avatar instanceof File) || avatar.size <= 0) {
    return redirectToProfile("?error=avatar");
  }

  if (!ALLOWED_AVATAR_TYPES.has(avatar.type) || avatar.size > MAX_AVATAR_SIZE_BYTES) {
    return redirectToProfile("?error=avatar");
  }

  try {
    const extension = avatar.type === "image/png" ? "png" : avatar.type === "image/webp" ? "webp" : "jpg";
    const bytes = await avatar.arrayBuffer();
    const uploaded = await uploadObject({
      key: `avatars/${user.id}/${Date.now()}.${extension}`,
      body: Buffer.from(bytes),
      contentType: avatar.type
    });

    await db.user.update({
      where: { id: user.id },
      data: {
        avatarUrl: uploaded.url
      }
    });
  } catch (error) {
    console.error("Failed to upload avatar", error);
    return redirectToProfile("?error=avatar");
  }

  return redirectToProfile("?avatar=1");
}
