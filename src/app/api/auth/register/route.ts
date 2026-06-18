import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(80).optional(),
  password: z.string().min(8)
});

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/register", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
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
    return redirectWithError(request, "这个邮箱已经注册过。");
  }

  const user = await db.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password)
    }
  });

  await createSession(user.id);

  return NextResponse.redirect(new URL("/create", request.url), { status: 303 });
}
