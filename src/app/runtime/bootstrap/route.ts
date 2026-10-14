import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPreviewToken, previewCookieName } from "@/lib/game-build-security";
import { requireGameRuntimeHost, requireRuntimeHost } from "@/lib/game-build-runtime";
import { publicRequestUrl } from "@/lib/request-origin";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const requestUrl = publicRequestUrl(request, Boolean(process.env.RAILWAY_PROJECT_ID));
    requireRuntimeHost(requestUrl, env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production");
    const token = new URL(requestUrl).searchParams.get("grant");
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid grant.");
    const tokenHash = hashPreviewToken(token), now = new Date();
    const candidate = await db.buildPreviewSession.findUnique({ where: { tokenHash }, include: { version: { select: { gameId: true, game: { select: { authorId: true } } } } } });
    if (!candidate || candidate.userId !== candidate.version.game.authorId) throw new Error("Preview unavailable.");
    requireGameRuntimeHost(requestUrl, env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production", candidate.version.gameId);
    const claimed = await db.buildPreviewSession.updateMany({ where: { tokenHash, activatedAt: null, bootstrapExpiresAt: { gt: now }, expiresAt: { gt: now } }, data: { activatedAt: now } });
    if (claimed.count !== 1) throw new Error("Grant expired or consumed.");
    const session = await db.buildPreviewSession.findUnique({ where: { tokenHash }, include: { version: { select: { game: { select: { authorId: true } } } } } });
    if (!session || session.userId !== session.version.game.authorId) throw new Error("Preview owner mismatch.");
    const response = NextResponse.redirect(new URL(`/runtime/builds/${session.versionId}/index.html`, requestUrl), { status: 303 });
    const secure = new URL(requestUrl).protocol === "https:";
    response.cookies.set(previewCookieName(session.versionId), token, { httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: `/runtime/builds/${session.versionId}/`, expires: session.expiresAt });
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors " + new URL(env.APP_URL).origin);
    return response;
  } catch { return new NextResponse("Preview link expired or unavailable. Open a new preview from the studio.", { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'" } }); }
}
