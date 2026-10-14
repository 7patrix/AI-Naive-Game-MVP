import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { validateBuildPath } from "@/lib/game-build-archive";
import { buildSecurityHeaders, canReadBuild, hashPreviewToken, previewCookieName } from "@/lib/game-build-security";
import { addGodotBridge, requireGameRuntimeHost, requireRuntimeHost } from "@/lib/game-build-runtime";
import { readStoredBuildFile, storedBuildFilesSchema } from "@/lib/game-build-storage";
export const runtime = "nodejs";
type Context = { params: Promise<{ versionId: string; path: string[] }> };
export async function GET(request: NextRequest, { params }: Context) {
  const denied = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" } });
  try {
    requireRuntimeHost(request.url, env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production");
    const { versionId, path } = await params, filePath = validateBuildPath(path.join("/"));
    const version = await db.gameVersion.findFirst({ where: { id: versionId, game: { runtime: "GODOT_WEB" } }, include: { game: { select: { id: true, status: true, currentVersionNumber: true, authorId: true } } } });
    if (!version) return denied();
    requireGameRuntimeHost(request.url, env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production", version.game.id);
    const token = request.cookies.get(previewCookieName(versionId))?.value;
    const session = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? await db.buildPreviewSession.findUnique({ where: { tokenHash: hashPreviewToken(token) } }) : null;
    if (!canReadBuild(version, session, versionId)) return denied();
    const files = storedBuildFilesSchema.safeParse(version.buildFiles);
    if (!files.success) return denied();
    const file = files.data.find((item) => item.path === filePath);
    if (!file) return denied();
    const bytes = await readStoredBuildFile(version.game.id, versionId, file);
    const body = filePath === "index.html" ? Buffer.from(addGodotBridge(bytes.toString("utf8"), env.APP_URL, versionId)) : bytes;
    return new NextResponse(new Uint8Array(body), { headers: { ...buildSecurityHeaders(env.APP_URL), "Content-Type": file.contentType, "Content-Length": String(body.length), "Accept-Ranges": "none" } });
  } catch { return denied(); }
}
