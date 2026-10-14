import { BuildInputError } from "./game-build-archive";
import { publicRequestUrl } from "./request-origin";

export function checkStudioRequest(request: Request, appUrl: string, trustedRailwayProxy = false) {
  const origin = new URL(appUrl).origin;
  try {
    if (new URL(publicRequestUrl(request, trustedRailwayProxy)).origin !== origin || request.headers.get("origin") !== origin) throw new Error("Origin mismatch.");
  } catch { throw new BuildInputError("请求来源不正确，请从作品工作台操作。"); }
}
export async function readBoundedBody(request: Request, limit: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new BuildInputError("上传请求过大。");
  if (!request.body) throw new BuildInputError("上传内容为空。");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new BuildInputError("上传请求过大。");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
