import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
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

  await createSession(user.id);

  return NextResponse.redirect(new URL(safeNextPath(parsed.data.next), env.APP_URL), { status: 303 });
}
