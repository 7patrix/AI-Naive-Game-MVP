import { NextRequest, NextResponse } from "next/server";
import { GameEventType, GameStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type GameEventsRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

const playEventSchema = z.object({
  type: z.enum([GameEventType.PLAY_LOADED, GameEventType.PLAY_ERROR]),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export async function POST(request: NextRequest, { params }: GameEventsRouteProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  const parsed = playEventSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid play event payload." }, { status: 400 });
  }

  const game = await db.game.findFirst({
    where: {
      id,
      status: GameStatus.PUBLISHED
    },
    select: {
      id: true
    }
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  await db.gameEvent.create({
    data: {
      gameId: game.id,
      userId: user?.id,
      type: parsed.data.type,
      metadata: (parsed.data.metadata ?? {}) as Prisma.InputJsonObject
    }
  });

  return NextResponse.json({ ok: true });
}
