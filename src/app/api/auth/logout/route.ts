import { NextRequest, NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(request: NextRequest) {
  await destroyCurrentSession();
  return NextResponse.redirect(new URL("/login?loggedOut=1", env.APP_URL), { status: 303 });
}
