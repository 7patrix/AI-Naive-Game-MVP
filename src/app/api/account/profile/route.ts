import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isValidUsername, normalizeUsername } from "@/lib/user-profile";

const profileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  username: z.string().trim().optional(),
  bio: z.string().trim().max(240).optional(),
  websiteUrl: z.string().trim().optional()
});

function redirectToProfile(search: string) {
  return NextResponse.redirect(new URL(`/account/profile${search}`, env.APP_URL), { status: 303 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/account/profile", env.APP_URL), { status: 303 });
  }

  const formData = await request.formData();
  const parsed = profileSchema.safeParse({
    name: formData.get("name") || undefined,
    username: formData.get("username") || undefined,
    bio: formData.get("bio") || undefined,
    websiteUrl: formData.get("websiteUrl") || undefined
  });

  if (!parsed.success) {
    return redirectToProfile("?error=invalid");
  }

  const username = parsed.data.username ? normalizeUsername(parsed.data.username) : null;
  const websiteUrl = parsed.data.websiteUrl || null;

  if (username && !isValidUsername(username)) {
    return redirectToProfile("?error=invalid");
  }

  if (websiteUrl) {
    try {
      new URL(websiteUrl);
    } catch {
      return redirectToProfile("?error=invalid");
    }
  }

  if (username) {
    const existing = await db.user.findFirst({
      where: {
        username,
        id: {
          not: user.id
        }
      }
    });

    if (existing) {
      return redirectToProfile("?error=username_taken");
    }
  }

  try {
    await db.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name || null,
        username,
        bio: parsed.data.bio || null,
        websiteUrl
      }
    });
  } catch (error) {
    console.error("Failed to update profile", error);
    return redirectToProfile("?error=failed");
  }

  return redirectToProfile("?saved=1");
}
