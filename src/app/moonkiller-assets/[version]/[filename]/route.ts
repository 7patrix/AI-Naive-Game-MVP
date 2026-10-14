import { NextResponse } from "next/server";
import { stat, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { env } from "@/lib/env";
import { publicRequestUrl } from "@/lib/request-origin";
import { addGodotBridge } from "@/lib/game-build-runtime";
import { addMoonKillerSaveBridge } from "@/lib/moonkiller-save";
import { moonkillerFile, moonkillerAssetHeaders, MOONKILLER_ASSET_DIRECTORY } from "@/lib/moonkiller";
export const runtime = "nodejs";
type Context = { params: Promise<{ version: string; filename: string }> };
async function serve(request: Request, context: Context, head: boolean) {
  const denied = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const { version, filename } = await context.params;
  const file = moonkillerFile(version, filename);
  if (!file) return denied();
  try {
    if (new URL(publicRequestUrl(request, Boolean(process.env.RAILWAY_PROJECT_ID))).origin !== new URL(env.APP_URL).origin) return denied();
    const source = path.join(process.cwd(), MOONKILLER_ASSET_DIRECTORY, version, filename);
    if ((await stat(source)).size !== file.bytes) {
      return new NextResponse("Game resources temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const headers = { ...moonkillerAssetHeaders(env.APP_URL, filename, version), "Content-Type": file.mime };
    if (head) return new NextResponse(null, { headers: filename === "index.html" ? headers : { ...headers, "Content-Length": String(file.bytes) } });
    if (filename === "index.html") {
      return new NextResponse(addMoonKillerSaveBridge(addGodotBridge(await readFile(source, "utf8"), env.APP_URL, version), env.APP_URL, version), { headers });
    }
    const stream = Readable.toWeb(createReadStream(source)) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, { headers: { ...headers, "Content-Length": String(file.bytes), ETag: `"${file.sha256}"` } });
  } catch {
    return new NextResponse("Game resources temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = (request: Request, context: Context) => serve(request, context, false);
export const HEAD = (request: Request, context: Context) => serve(request, context, true);
