import { NextResponse } from "next/server";
import { getCurrentUser, isAdminUser } from "./auth";
import { env } from "./env";
import { BuildInputError } from "./game-build-archive";
import { checkStudioRequest } from "./game-build-request";

export async function studioAuthor(request: Request) {
  checkStudioRequest(request, env.APP_URL, Boolean(process.env.RAILWAY_PROJECT_ID));
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) throw new BuildInputError("当前只开放平台作者上传，请使用作者账号登录。");
  return user;
}
export function studioError(error: unknown) {
  if (error instanceof BuildInputError) return NextResponse.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  console.error("Studio operation failed", { kind: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ error: "操作未完成，请稍后重试。原有发布版本保持不变。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
