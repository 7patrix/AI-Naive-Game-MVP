import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

type DeleteApiCredentialRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: NextRequest, { params }: DeleteApiCredentialRouteProps) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/account/api-keys", env.APP_URL), { status: 303 });
  }

  const { id } = await params;
  const credential = await db.userApiCredential.findFirst({
    where: {
      id,
      userId: user.id
    }
  });

  if (!credential) {
    return NextResponse.redirect(new URL("/account/api-keys?error=not_found", env.APP_URL), { status: 303 });
  }

  try {
    await db.userApiCredential.delete({
      where: { id: credential.id }
    });
  } catch (error) {
    console.error("Failed to delete API credential", error);
    return NextResponse.redirect(new URL("/account/api-keys?error=delete_failed", env.APP_URL), { status: 303 });
  }

  return NextResponse.redirect(new URL("/account/api-keys?saved=1", env.APP_URL), { status: 303 });
}
