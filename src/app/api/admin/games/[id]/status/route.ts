import { NextRequest, NextResponse } from "next/server";
import { GameStatus } from "@prisma/client";
import { requireAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";

type AdminGameStatusRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: AdminGameStatusRouteProps) {
  const admin = await requireAdminUser();

  if (!admin) {
    return NextResponse.redirect(new URL("/login?next=/admin", request.url), { status: 303 });
  }

  const { id } = await params;
  const formData = await request.formData();
  const status = formData.get("status");

  if (status !== GameStatus.PUBLISHED && status !== GameStatus.ARCHIVED) {
    return NextResponse.redirect(new URL("/admin?error=invalid-status", request.url), { status: 303 });
  }

  const game = await db.game.update({
    where: { id },
    data: {
      status,
      publishedAt: status === GameStatus.PUBLISHED ? new Date() : undefined
    },
    select: {
      id: true,
      title: true,
      status: true
    }
  });

  await db.adminAuditLog.create({
    data: {
      adminId: admin.id,
      action: status === GameStatus.ARCHIVED ? "GAME_ARCHIVED" : "GAME_REPUBLISHED",
      targetId: game.id,
      metadata: {
        title: game.title,
        status: game.status
      }
    }
  });

  return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
}
