import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { BUILD_LIMITS, BuildInputError, readGodotArchive } from "@/lib/game-build-archive";
import { checkBuildEncryption, gameRuntimeOrigin, runtimeOrigin } from "@/lib/game-build-security";
import { readBoundedBody } from "@/lib/game-build-request";
import { removeBuildObjects, storeBuildFiles } from "@/lib/game-build-storage";
import { studioAuthor, studioError } from "@/lib/studio-api";

export const runtime = "nodejs";
const fields = z.object({ gameId: z.string().uuid().optional(), title: z.string().trim().min(1).max(80), description: z.string().trim().max(2000), engineVersion: z.string().trim().min(1).max(32), plannedPlayMode: z.enum(["SINGLE_PLAYER", "MULTIPLAYER", "BOTH"]), changeSummary: z.string().trim().min(1).max(500) });
export async function POST(request: Request) {
  let uploadedKeys: string[] = [];
  try {
    const user = await studioAuthor(request);
    const isolatedOrigin = runtimeOrigin(env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production");
    checkBuildEncryption(env.GAME_BUILD_ENCRYPTION_SECRET);
    const body = await readBoundedBody(request, BUILD_LIMITS.archiveBytes + 1024 * 1024);
    const form = await new Response(new Uint8Array(body), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const parsed = fields.safeParse(Object.fromEntries(["gameId", "title", "description", "engineVersion", "plannedPlayMode", "changeSummary"].map((key) => [key, form.get(key) || (key === "gameId" ? undefined : "")])));
    if (!parsed.success) throw new BuildInputError("请填写作品名称、Godot 版本和更新说明，并检查字段长度。");
    const archive = form.get("build");
    if (!(archive instanceof File) || !archive.name.toLowerCase().endsWith(".zip") || archive.size > BUILD_LIMITS.archiveBytes) throw new BuildInputError("请选择不超过 32MB 的 ZIP 导出包。");
    const existing = parsed.data.gameId ? await db.game.findFirst({ where: { id: parsed.data.gameId, authorId: user.id, runtime: "GODOT_WEB" }, select: { id: true } }) : null;
    if (parsed.data.gameId && !existing) throw new BuildInputError("无法更新：作品不存在或不属于当前作者。");
    const gameId = existing?.id ?? randomUUID(), versionId = randomUUID();
    const gameOrigin = gameRuntimeOrigin(isolatedOrigin, gameId);
    const files = readGodotArchive(Buffer.from(await archive.arrayBuffer()));
    const stored = await storeBuildFiles(gameId, versionId, files);
    uploadedKeys = stored.map((file) => file.storageKey);
    const version = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${gameId}))::text`;
      const latest = await tx.gameVersion.findFirst({ where: { gameId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      if (!existing) await tx.game.create({ data: { id: gameId, slug: `game-${gameId}`, title: parsed.data.title, description: parsed.data.description, tags: ["Godot"], authorId: user.id, runtime: "GODOT_WEB", plannedPlayMode: parsed.data.plannedPlayMode, status: "DRAFT" } });
      else await tx.game.update({ where: { id: gameId }, data: { plannedPlayMode: parsed.data.plannedPlayMode } });
      return tx.gameVersion.create({ data: { id: versionId, gameId, versionNumber: (latest?.versionNumber ?? 0) + 1, title: parsed.data.title, description: parsed.data.description, engineVersion: parsed.data.engineVersion, changeSummary: parsed.data.changeSummary, buildStatus: "DRAFT", buildFiles: stored as Prisma.InputJsonValue, manifestUrl: "", bundleUrl: `${gameOrigin}/runtime/builds/${versionId}/index.html`, storagePrefix: `encrypted-builds/${gameId}/${versionId}` } });
    }, { timeout: 15000 });
    uploadedKeys = [];
    return NextResponse.json({ gameId, versionId: version.id, versionNumber: version.versionNumber, href: `/studio/games/${gameId}?uploaded=1` }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (uploadedKeys.length) await removeBuildObjects(uploadedKeys); return studioError(error); }
}
