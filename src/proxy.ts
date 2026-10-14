import { NextRequest, NextResponse } from "next/server";
import { runtimeHostAccess } from "./lib/game-build-runtime";

export function proxy(request: NextRequest) {
  const access = runtimeHostAccess(request.url, process.env.APP_URL ?? "http://localhost:3000", process.env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production");
  if (access === "deny") return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.next();
}
export const config = { matcher: "/:path*" };
