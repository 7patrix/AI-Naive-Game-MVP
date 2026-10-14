import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { BuildInputError } from "./game-build-archive";

export const PREVIEW_BOOTSTRAP_MS = 60 * 1000;
export const PREVIEW_SESSION_MS = 20 * 60 * 1000;
export const previewCookieName = (versionId: string) => `dm_preview_${versionId}`;
export const hashPreviewToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function issuePreviewToken(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPreviewToken(token), bootstrapExpiresAt: new Date(now + PREVIEW_BOOTSTRAP_MS), expiresAt: new Date(now + PREVIEW_SESSION_MS) };
}
export function runtimeOrigin(appUrl: string, runtimeUrl: string | undefined, production: boolean): string {
  if (!runtimeUrl) throw new BuildInputError("尚未配置独立的游戏资源地址，请联系平台维护者。");
  const app = new URL(appUrl), runtime = new URL(runtimeUrl);
  const loopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (runtime.origin === app.origin || runtime.username || runtime.password || runtime.pathname !== "/" || runtime.search || runtime.hash || !["http:", "https:"].includes(runtime.protocol)) throw new BuildInputError("游戏资源必须使用独立来源，不能与主站同源。");
  if (production ? app.protocol !== "https:" || runtime.protocol !== "https:" : (app.protocol !== "https:" || runtime.protocol !== "https:") && (!loopback(app.hostname) || !loopback(runtime.hostname))) throw new BuildInputError("游戏资源地址需要 HTTPS；本地调试仅允许回环地址。");
  return runtime.origin;
}
/** A stable origin per game isolates untrusted builds from other games and preserves saves across versions. */
export function gameRuntimeOrigin(baseOrigin: string, gameId: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(gameId)) throw new BuildInputError("游戏标识不正确。");
  const url = new URL(baseOrigin);
  if (url.hostname === "127.0.0.1" || url.hostname === "[::1]") throw new BuildInputError("游戏资源基址需要支持子域名；本地请使用 localhost 或本地 HTTPS 域名。");
  url.hostname = `g-${gameId}.${url.hostname}`;
  return url.origin;
}
function encryptionKey(secret: string | undefined) {
  if (!secret || Buffer.byteLength(secret) < 32) throw new BuildInputError("尚未配置游戏构建加密密钥，草稿上传暂不可用。");
  return createHash("sha256").update("duckmole-build-v1\0").update(secret).digest();
}
export function checkBuildEncryption(secret: string | undefined) { encryptionKey(secret); }
export function encryptBuildFile(bytes: Buffer, context: string, secret: string | undefined) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from("DMG1"), iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBuildFile(bytes: Buffer, context: string, secret: string | undefined) {
  if (bytes.length < 32 || bytes.subarray(0, 4).toString() !== "DMG1") throw new Error("Invalid encrypted game build.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), bytes.subarray(4, 16));
  decipher.setAuthTag(bytes.subarray(16, 32));
  decipher.setAAD(Buffer.from(context));
  return Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]);
}
export function buildSecurityHeaders(appOrigin: string) {
  return {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": `default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${new URL(appOrigin).origin};`
  };
}
export function canReadBuild(version: { buildStatus: string; versionNumber: number; game: { status: string; currentVersionNumber: number; authorId: string } }, session: { versionId: string; userId: string; expiresAt: Date; activatedAt: Date | null } | null, versionId: string, now = new Date()) {
  return (version.buildStatus === "PUBLISHED" && version.game.status === "PUBLISHED" && version.game.currentVersionNumber === version.versionNumber) || Boolean(session && session.versionId === versionId && session.userId === version.game.authorId && session.activatedAt && session.expiresAt > now);
}
