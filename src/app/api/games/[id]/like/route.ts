import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=/play/${id}`, request.url), { status: 303 });
  }

  const existing = await db.gameLike.findUnique({
    where: {
      userId_gameId: {
        userId: user.id,
        gameId: id
      }
    }
  });

  if (existing) {
    await db.$transaction([
      db.gameLike.delete({ where: { id: existing.id } }),
      db.game.update({
        where: { id },
        data: {
          likeCount: {
            decrement: 1
          }
        }
      })
    ]);
  } else {
    await db.$transaction([
      db.gameLike.create({
        data: {
          userId: user.id,
          gameId: id
        }
      }),
      db.game.update({
        where: { id },
        data: {
          likeCount: {
            increment: 1
          }
        }
      })
    ]);
  }

  const referer = request.headers.get("referer") ?? "/";
  return NextResponse.redirect(new URL(referer, request.url), { status: 303 });
}
