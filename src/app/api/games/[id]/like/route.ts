import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getSafeReturnUrl(request: NextRequest, fallbackPath: string) {
  const referer = request.headers.get("referer");

  if (!referer) {
    return new URL(fallbackPath, env.APP_URL);
  }

  try {
    const parsed = new URL(referer);
    const appUrl = new URL(env.APP_URL);

    if (parsed.host === appUrl.host) {
      return new URL(`${parsed.pathname}${parsed.search}`, env.APP_URL);
    }
  } catch {
    // Ignore malformed referer and use fallback.
  }

  return new URL(fallbackPath, env.APP_URL);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=/play/${id}`, env.APP_URL), { status: 303 });
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

  return NextResponse.redirect(getSafeReturnUrl(request, `/play/${id}`), { status: 303 });
}
