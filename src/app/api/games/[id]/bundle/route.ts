import { NextResponse } from "next/server";
import { GameStatus } from "@prisma/client";
import { db } from "@/lib/db";

type GameBundleRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: GameBundleRouteProps) {
  const { id } = await params;
  const game = await db.game.findFirst({
    where: {
      id,
      status: GameStatus.PUBLISHED
    },
    select: {
      id: true,
      bundleUrl: true
    }
  });

  if (!game?.bundleUrl) {
    return NextResponse.json({ error: "Game bundle not found." }, { status: 404 });
  }

  const response = await fetch(game.bundleUrl, { cache: "no-store" });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Bundle source request failed: ${response.status}` },
      { status: 502 }
    );
  }

  const html = await response.text();

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src * data: blob:; media-src *; font-src data:; connect-src 'none';"
    }
  });
}
