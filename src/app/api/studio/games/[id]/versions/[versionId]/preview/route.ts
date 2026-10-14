import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { BuildInputError } from "@/lib/game-build-archive";
import { checkBuildEncryption, gameRuntimeOrigin, issuePreviewToken, runtimeOrigin } from "@/lib/game-build-security";
import { studioAuthor, studioError } from "@/lib/studio-api";
type Context = { params: Promise<{ id: string; versionId: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await studioAuthor(request), { id, versionId } = await params;
    const origin = gameRuntimeOrigin(runtimeOrigin(env.APP_URL, env.GAME_RUNTIME_URL, process.env.NODE_ENV === "production"), id);
    checkBuildEncryption(env.GAME_BUILD_ENCRYPTION_SECRET);
    const version = await db.gameVersion.findFirst({ where: { id: versionId, gameId: id, game: { authorId: user.id, runtime: "GODOT_WEB" } }, select: { id: true, buildFiles: true } });
    if (!version?.buildFiles) throw new BuildInputError("无法预览：版本不存在或不属于当前作者。");
    const previewLock = `preview:${user.id}`;
    const grant = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${previewLock}))::text`;
      const now = new Date();
      await tx.buildPreviewSession.deleteMany({ where: { userId: user.id, OR: [{ expiresAt: { lte: now } }, { activatedAt: null, bootstrapExpiresAt: { lte: now } }] } });
      if (await tx.buildPreviewSession.count({ where: { userId: user.id } }) >= 8) throw new BuildInputError("预览窗口过多，请稍后再试，或关闭并撤销之前的预览。");
      const issued = issuePreviewToken();
      await tx.buildPreviewSession.create({ data: { versionId, userId: user.id, tokenHash: issued.tokenHash, bootstrapExpiresAt: issued.bootstrapExpiresAt, expiresAt: issued.expiresAt } });
      return issued;
    });
    return NextResponse.json({ entryUrl: `${origin}/runtime/bootstrap?grant=${grant.token}`, runtimeOrigin: origin }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return studioError(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await studioAuthor(request), { id, versionId } = await params;
    const version = await db.gameVersion.findFirst({ where: { id: versionId, gameId: id, game: { authorId: user.id } }, select: { id: true } });
    if (!version) throw new BuildInputError("版本不存在。");
    const previewLock = `preview:${user.id}`;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${previewLock}))::text`;
      await tx.buildPreviewSession.deleteMany({ where: { versionId, userId: user.id } });
    });
    return NextResponse.json({ revoked: true });
  } catch (error) { return studioError(error); }
}
