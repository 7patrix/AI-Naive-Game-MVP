import { NextRequest, NextResponse } from "next/server";
import { runtimeHostAccess } from "./lib/game-build-runtime";
import { publicRequestUrl } from "./lib/request-origin";

export function proxy(request: NextRequest) {
  let access: string;
  try { access = runtimeHostAccess(publicRequestUrl(request, Boolean(process.env.RAILWAY_PROJECT_ID)), process.env.APP_URL ?? "http://localhost:3000", process.env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production"); }
  catch { access = "deny"; }
  if (access === "deny") return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.next();
}
export const config = { matcher: "/:path*" };
