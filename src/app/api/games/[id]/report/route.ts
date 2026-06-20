import { NextRequest, NextResponse } from "next/server";
import { GameStatus } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type GameReportRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

const reportSchema = z.object({
  reason: z.string().trim().min(2).max(80),
  details: z.string().trim().max(500).optional()
});

export async function POST(request: NextRequest, { params }: GameReportRouteProps) {
  const user = await getCurrentUser();
  const { id } = await params;
  const formData = await request.formData();
  const parsed = reportSchema.safeParse({
    reason: formData.get("reason"),
    details: formData.get("details") || undefined
  });

  const game = await db.game.findFirst({
    where: {
      id,
      status: GameStatus.PUBLISHED
    },
    select: {
      id: true,
      slug: true,
      title: true
    }
  });

  if (!game) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }

  if (!parsed.success) {
    return NextResponse.redirect(new URL(`/games/${game.slug}?reportError=1`, request.url), { status: 303 });
  }

  await db.gameReport.create({
    data: {
      gameId: game.id,
      reporterId: user?.id,
      reason: parsed.data.reason,
      details: parsed.data.details
    }
  });

  return NextResponse.redirect(new URL(`/games/${game.slug}?reported=1`, request.url), { status: 303 });
}
