import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { BuildInputError } from "@/lib/game-build-archive";
import { checkBuildEncryption, gameRuntimeOrigin, runtimeOrigin } from "@/lib/game-build-security";
import { readStoredBuildFile, storedBuildFilesSchema } from "@/lib/game-build-storage";
import { studioAuthor, studioError } from "@/lib/studio-api";
import { readBoundedBody } from "@/lib/game-build-request";
type Context = { params: Promise<{ id: string; versionId: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await studioAuthor(request), { id, versionId } = await params;
    const origin = gameRuntimeOrigin(runtimeOrigin(env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production"), id);
    checkBuildEncryption(env.GAME_BUILD_ENCRYPTION_SECRET);
    let confirmation: unknown;
    try { confirmation = JSON.parse((await readBoundedBody(request, 1024)).toString("utf8")); } catch { throw new BuildInputError("请先试玩并确认公开发布这个版本。"); }
    if (!confirmation || typeof confirmation !== "object" || !("verifiedByAuthor" in confirmation) || confirmation.verifiedByAuthor !== true) throw new BuildInputError("请先试玩并确认公开发布这个版本。");
    const candidate = await db.gameVersion.findFirst({ where: { id: versionId, gameId: id, game: { authorId: user.id, runtime: "GODOT_WEB" } }, select: { buildFiles: true } });
    if (!candidate) throw new BuildInputError("版本不存在或不属于当前作者。");
    const files = storedBuildFilesSchema.safeParse(candidate.buildFiles);
    if (!files.success || !["index.html", "index.js", "index.wasm", "index.pck"].every((path) => files.data.some((file) => file.path === path))) throw new BuildInputError("版本资源不完整，无法发布。");
    // Validate ciphertext and hashes before acquiring the database lock.
    for (const file of files.data) await readStoredBuildFile(id, versionId, file);
    const verifiedManifest = JSON.stringify(candidate.buildFiles);
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
      const version = await tx.gameVersion.findFirst({ where: { id: versionId, gameId: id, game: { authorId: user.id, runtime: "GODOT_WEB" } }, include: { game: true } });
      if (!version) throw new BuildInputError("版本不存在或不属于当前作者。");
      if (JSON.stringify(version.buildFiles) !== verifiedManifest) throw new BuildInputError("版本资源已变化，请重新试玩后发布。");
      await tx.gameVersion.update({ where: { id: versionId }, data: { buildStatus: "PUBLISHED" } });
      const game = await tx.game.update({ where: { id }, data: { status: "PUBLISHED", currentVersionNumber: version.versionNumber, title: version.title, description: version.description, bundleUrl: `${origin}/runtime/builds/${versionId}/index.html`, manifestUrl: null, storagePrefix: version.storagePrefix, publishedAt: new Date() } });
      await tx.adminAuditLog.create({ data: { adminId: user.id, action: "GODOT_VERSION_PUBLISHED", targetId: id, metadata: { versionId, versionNumber: version.versionNumber } } });
      return game;
    });
    return NextResponse.json({ published: true, href: `/games/${result.slug}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return studioError(error); }
}
