import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { BUILD_LIMITS, crc32, readGodotArchive, validateBuildPath } from "../src/lib/game-build-archive";
import { buildSecurityHeaders, canReadBuild, decryptBuildFile, encryptBuildFile, gameRuntimeOrigin, hashPreviewToken, issuePreviewToken, runtimeOrigin } from "../src/lib/game-build-security";
import { addGodotBridge, requireGameRuntimeHost, runtimeHostAccess } from "../src/lib/game-build-runtime";
import { checkStudioRequest, readBoundedBody } from "../src/lib/game-build-request";
import { publicRequestUrl } from "../src/lib/request-origin";

type Item = { name: string; bytes: Buffer; declaredSize?: number; symlink?: boolean; descriptor?: boolean; deflate?: boolean; compressionFlags?: number };
const fixture = (): Item[] => [
  { name: "index.html", bytes: Buffer.from("<html><head></head><body><script src='index.js'></script></body></html>") },
  { name: "index.js", bytes: Buffer.from("var Engine=function(){};") },
  { name: "index.wasm", bytes: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]) },
  { name: "index.pck", bytes: Buffer.from("GDPC-test-fixture") }
];
function zip(items: Item[]) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name), data = item.deflate ? deflateRawSync(item.bytes) : item.bytes, flags = 0x800 | (item.descriptor ? 8 : 0) | (item.compressionFlags ?? 0), crc = crc32(item.bytes), size = item.declaredSize ?? item.bytes.length;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(item.deflate ? 8 : 0, 8); local.writeUInt16LE(name.length, 26);
    if (!item.descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(size, 22); }
    const descriptor = item.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (item.descriptor) { descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(data.length, 8); descriptor.writeUInt32LE(size, 12); }
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(0x314, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(flags, 8); entry.writeUInt16LE(item.deflate ? 8 : 0, 10); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(size, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE((item.symlink ? 0xa000 : 0x8000) * 65536, 38); entry.writeUInt32LE(offset, 42);
    locals.push(local, name, data, descriptor); central.push(entry, name); offset += local.length + name.length + data.length + descriptor.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(items.length, 8); end.writeUInt16LE(items.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
test("reads full Godot export, correct MIME and content hashes", () => {
  const files = readGodotArchive(zip(fixture())); assert.equal(files.length, 4); assert.equal(files.find((file) => file.path === "index.wasm")?.contentType, "application/wasm"); assert.equal(files[0].sha256.length, 64);
});
test("supports DEFLATE, data descriptors and one enclosing folder", () => {
  const files = readGodotArchive(zip(fixture().map((item) => ({ ...item, name: `Export/${item.name}`, deflate: true, descriptor: true })))); assert.equal(files[0].path, "index.html");
  assert.equal(readGodotArchive(zip(fixture().map((item) => ({ ...item, deflate: true, compressionFlags: 2 })))).length, 4);
  assert.throws(() => readGodotArchive(zip(fixture().map((item) => ({ ...item, compressionFlags: 2 })))));
});
test("rejects traversal, encoded paths, Windows and absolute paths", () => {
  for (const path of ["../escape.js", "/escape.js", "C:/escape.js", "a\\escape.js", "%2e%2e/escape.js", "a/./b.js", "a/../b.js", "a//b.js", "a\0.js", "CON.js", "a./b.js"]) { assert.throws(() => validateBuildPath(path)); assert.throws(() => readGodotArchive(zip([...fixture(), { name: path, bytes: Buffer.from("x") }]))); }
});
test("rejects symlinks and case-insensitive duplicate names", () => {
  assert.throws(() => readGodotArchive(zip([...fixture(), { name: "link.js", bytes: Buffer.from("index.js"), symlink: true }])));
  assert.throws(() => readGodotArchive(zip([...fixture(), { name: "INDEX.js", bytes: Buffer.from("x") }])));
});
test("rejects CRC corruption and disagreement between file headers", () => {
  const archive = zip(fixture()); archive[40] ^= 1; assert.throws(() => readGodotArchive(archive));
  const mismatched = zip(fixture()); mismatched.writeUInt16LE(8, 8); assert.throws(() => readGodotArchive(mismatched));
});
test("rejects missing exports, nested active HTML and unsupported files", () => {
  assert.throws(() => readGodotArchive(zip(fixture().slice(0, 3))));
  for (const name of ["other.html", "index.worker.js", "secret.env", "source.zip"]) assert.throws(() => readGodotArchive(zip([...fixture(), { name, bytes: Buffer.from("x") }])));
});
test("rejects encrypted and ZIP64 archives", () => {
  const archive = zip(fixture()), end = archive.length - 22, central = archive.readUInt32LE(end + 16); archive.writeUInt16LE(0x801, central + 8); assert.throws(() => readGodotArchive(archive));
  const zip64 = zip(fixture()); zip64.writeUInt32LE(0xffffffff, zip64.length - 6); assert.throws(() => readGodotArchive(zip64));
});
test("rejects forged sizes, compression bombs and excess file counts", () => {
  assert.throws(() => readGodotArchive(zip([{ ...fixture()[0], declaredSize: BUILD_LIMITS.fileBytes + 1 }, ...fixture().slice(1)])));
  assert.throws(() => readGodotArchive(zip([...fixture(), { name: "bomb.bin", bytes: Buffer.alloc(2 * 1024 * 1024), deflate: true }])));
  assert.throws(() => readGodotArchive(zip([...fixture(), { name: "bad.bin", bytes: Buffer.from("x"), declaredSize: 0 }])));
  assert.throws(() => readGodotArchive(zip([...fixture(), ...Array.from({ length: 125 }, (_, i) => ({ name: `f${i}.txt`, bytes: Buffer.alloc(0) }))])));
});
test("rejects malformed directories, overlapping declarations and truncated data", () => {
  const archive = zip(fixture()), central = archive.readUInt32LE(archive.length - 6); archive.writeUInt32LE(central, central + 42); assert.throws(() => readGodotArchive(archive));
  assert.throws(() => readGodotArchive(zip(fixture()).subarray(0, -1)));
});
test("rejects PWA and invalid WASM exports", () => {
  const items = fixture(); items[0].bytes = Buffer.from("<html><head></head><body><script>navigator.serviceWorker.register('index.service.worker.js');</script></body></html>"); assert.throws(() => readGodotArchive(zip(items)));
  const bad = fixture(); bad[2].bytes = Buffer.from("not wasm"); assert.throws(() => readGodotArchive(zip(bad)));
  const noHead = fixture(); noHead[0].bytes = Buffer.from("<html><body></body></html>"); assert.throws(() => readGodotArchive(zip(noHead)));
});
test("accepts the real Godot 4.7.2 shell with inactive service-worker fallback", () => {
  const html = readFileSync(new URL("./fixtures/godot-4.7.2-standard-shell.html", import.meta.url));
  assert.match(html.toString(), /serviceWorker/); assert.match(html.toString(), /GODOT_THREADS_ENABLED = false/);
  const items = fixture(); items[0].bytes = html;
  assert.equal(readGodotArchive(zip(items)).length, 4);
});
test("still rejects enabled PWA, threaded and extension configurations", () => {
  for (const config of [{ serviceWorker: "index.service.worker.js" }, { ensureCrossOriginIsolationHeaders: true }, { gdextensionLibs: ["extension.wasm"] }, { gdextensionLibs: "invalid" }]) {
    const items = fixture(); items[0].bytes = Buffer.from(`<html><head></head><body><script>const GODOT_CONFIG = ${JSON.stringify(config)};</script></body></html>`);
    assert.throws(() => readGodotArchive(zip(items)));
  }
  for (const name of ["GODOT_THREADS_ENABLED", "GODOT_EXTENSIONS_ENABLED"]) {
    const items = fixture(); items[0].bytes = Buffer.from(`<html><head></head><body><script>const ${name} = true;</script></body></html>`); assert.throws(() => readGodotArchive(zip(items)));
  }
});
test("malformed or executable export configuration cannot silently bypass feature checks", () => {
  for (const config of ["{serviceWorker: 'worker.js'}", "getUntrustedConfiguration()", "{\"serviceWorker\":"]){
    const items = fixture(); items[0].bytes = Buffer.from(`<html><head></head><body><script>const GODOT_CONFIG = ${config};</script></body></html>`); assert.throws(() => readGodotArchive(zip(items)));
  }
});
test("encrypts artifacts and authenticates ciphertext and object identity", () => {
  const secret = randomBytes(32).toString("hex"), plain = Buffer.from("private game code"), encrypted = encryptBuildFile(plain, "game-a/file-a", secret);
  assert.ok(!encrypted.includes(plain)); assert.deepEqual(decryptBuildFile(encrypted, "game-a/file-a", secret), plain);
  assert.throws(() => decryptBuildFile(encrypted, "game-b/file-a", secret)); const corrupt = Buffer.from(encrypted); corrupt[corrupt.length - 1] ^= 1; assert.throws(() => decryptBuildFile(corrupt, "game-a/file-a", secret));
  assert.throws(() => encryptBuildFile(plain, "a", undefined)); assert.throws(() => decryptBuildFile(encrypted, "game-a/file-a", randomBytes(32).toString("hex")));
});
test("requires separate HTTPS origins and isolates every game", () => {
  const base = runtimeOrigin("https://duckmole.example", "https://play.duckmole.example", true), a = randomUUID(), b = randomUUID();
  assert.notEqual(gameRuntimeOrigin(base, a), gameRuntimeOrigin(base, b)); assert.equal(gameRuntimeOrigin(base, a), gameRuntimeOrigin(base, a));
  for (const url of [undefined, "https://duckmole.example", "http://play.duckmole.example", "https://play.duckmole.example/path", "https://user:pass@play.duckmole.example"]) assert.throws(() => runtimeOrigin("https://duckmole.example", url, true));
  assert.throws(() => gameRuntimeOrigin(base, "../escape"));
});
test("runtime host cannot serve main app routes or another game's resources", () => {
  const app = "https://app.example", base = "https://play.example", a = randomUUID(), b = randomUUID(), origin = gameRuntimeOrigin(base, a);
  assert.equal(runtimeHostAccess(`${origin}/api/auth/login`, app, base, true), "deny"); assert.equal(runtimeHostAccess(`${origin}/studio`, app, base, true), "deny"); assert.equal(runtimeHostAccess(`${app}/runtime/bootstrap`, app, base, true), "deny"); assert.equal(runtimeHostAccess(`${origin}/runtime/bootstrap`, app, base, true), "runtime");
  assert.throws(() => requireGameRuntimeHost(`${origin}/runtime/builds/v/index.html`, app, base, true, b));
});
test("CSP permits engine assets and WASM but blocks external network, workers and forms", () => {
  const headers = buildSecurityHeaders("https://app.example"); assert.equal(headers["Cache-Control"], "private, no-store"); assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Content-Security-Policy"], /wasm-unsafe-eval/); assert.match(headers["Content-Security-Policy"], /connect-src 'self'/); assert.match(headers["Content-Security-Policy"], /worker-src 'none'/); assert.match(headers["Content-Security-Policy"], /frame-ancestors https:\/\/app.example/);
});
test("preview tokens are random, hash-only at rest and short lived", () => {
  const grant = issuePreviewToken(1000); assert.equal(grant.token.length, 43); assert.notEqual(grant.token, issuePreviewToken(1000).token); assert.equal(hashPreviewToken(grant.token), grant.tokenHash); assert.equal(+grant.bootstrapExpiresAt, 61000); assert.equal(+grant.expiresAt, 1201000);
});
test("anonymous access only reaches the current published version", () => {
  const version = { buildStatus: "DRAFT", versionNumber: 2, game: { status: "PUBLISHED", currentVersionNumber: 1, authorId: "owner" } };
  assert.equal(canReadBuild(version, null, "v2"), false); version.buildStatus = "PUBLISHED"; assert.equal(canReadBuild(version, null, "v2"), false); version.game.currentVersionNumber = 2; assert.equal(canReadBuild(version, null, "v2"), true); version.game.status = "ARCHIVED"; assert.equal(canReadBuild(version, null, "v2"), false);
});
test("draft grants cannot cross owners, versions, expiry or activation", () => {
  const version = { buildStatus: "DRAFT", versionNumber: 1, game: { status: "DRAFT", currentVersionNumber: 1, authorId: "owner" } }, session = { versionId: "v1", userId: "owner", expiresAt: new Date(2000), activatedAt: new Date(500) };
  assert.equal(canReadBuild(version, session, "v1", new Date(1000)), true);
  assert.equal(canReadBuild(version, { ...session, userId: "other" }, "v1", new Date(1000)), false); assert.equal(canReadBuild(version, session, "v2", new Date(1000)), false); assert.equal(canReadBuild(version, session, "v1", new Date(2000)), false); assert.equal(canReadBuild(version, { ...session, activatedAt: null }, "v1", new Date(1000)), false);
});
test("studio writes reject cross-origin and forged host requests", () => {
  checkStudioRequest(new Request("https://app.example/api/studio", { headers: { origin: "https://app.example" } }), "https://app.example");
  assert.throws(() => checkStudioRequest(new Request("https://app.example/api/studio"), "https://app.example")); assert.throws(() => checkStudioRequest(new Request("https://evil.example/api/studio", { headers: { origin: "https://app.example" } }), "https://app.example"));
});
test("trusted Railway authority restores HTTPS without retaining the internal port", () => {
  const request = new Request("http://localhost:8080/api/studio?probe=1", { headers: { host: "app.example", "x-forwarded-proto": "https", origin: "https://app.example" } });
  assert.equal(publicRequestUrl(request, true), "https://app.example/api/studio?probe=1");
  assert.equal(publicRequestUrl(request), request.url);
  checkStudioRequest(request, "https://app.example", true);
  assert.throws(() => checkStudioRequest(request, "https://app.example"));
});
test("proxy authority does not bypass cross-origin, host, protocol or ambiguity checks", () => {
  const request = (host: string, protocol: string, origin = "https://app.example") => new Request("http://localhost:8080/api/studio", { headers: { host, "x-forwarded-proto": protocol, origin } });
  for (const input of [request("evil.example", "https"), request("app.example", "http"), request("app.example", "https", "https://evil.example"), request("app.example,evil.example", "https"), request("app.example", "https,http"), request("app.example@evil.example", "https")]) assert.throws(() => checkStudioRequest(input, "https://app.example", true));
});
test("restored proxy authority retains the per-game runtime boundary", () => {
  const gameId = "00000000-0000-4000-8000-000000000001";
  const request = new Request("http://localhost:8080/runtime/builds/v1/index.html", { headers: { host: `g-${gameId}.games.example`, "x-forwarded-proto": "https" } });
  const url = publicRequestUrl(request, true);
  assert.equal(runtimeHostAccess(url, "https://app.example", "https://games.example", true), "runtime");
  assert.equal(runtimeHostAccess(url.replace("/runtime/builds/v1/index.html", "/account/profile"), "https://app.example", "https://games.example", true), "deny");
  requireGameRuntimeHost(url, "https://app.example", "https://games.example", true, gameId);
  assert.throws(() => requireGameRuntimeHost(url, "https://app.example", "https://games.example", true, "00000000-0000-4000-8000-000000000002"));
});
test("upload body limits apply to actual bytes, not only Content-Length", async () => {
  const request = (body: string, headers?: Record<string, string>) => new Request("https://app.example", { method: "POST", body, headers });
  assert.equal((await readBoundedBody(request("123"), 3)).toString(), "123"); await assert.rejects(readBoundedBody(request("1234"), 3)); await assert.rejects(readBoundedBody(request("1", { "content-length": "100" }), 3));
});
test("bridge reports engine start completion and preserves progress callbacks", async () => {
  const messages: unknown[] = [], progress: unknown[] = [];
  class Engine { startGame(config: { onProgress: (a: number, b: number) => void }) { config.onProgress(5, 10); return Promise.resolve("started"); } }
  const html = addGodotBridge("<html><head></head></html>", "https://app.example", "v1"), script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(script, { Engine, parent: { postMessage: (message: unknown, target: string) => { assert.equal(target, "https://app.example"); messages.push(message); } }, document: { addEventListener() {} }, window: { addEventListener() {} }, HTMLScriptElement: class {} });
  const result = await new Engine().startGame({ onProgress: (a: number, b: number) => progress.push([a, b]) }); assert.equal(result, "started"); assert.deepEqual(progress, [[5, 10]]); assert.equal((messages[0] as { event: string }).event, "progress"); assert.equal((messages[1] as { event: string }).event, "ready");
});
test("bridge wraps Godot's fresh per-instance prototype without replacing the Engine constructor", async () => {
  const messages: any[] = [], progress: unknown[] = [];
  function Engine() { return Object.create({ startGame(config: {onProgress:(a:number,b:number)=>void}) { config.onProgress(7,9); return Promise.resolve("real-style-started"); } }); }
  (Engine as any).getMissingFeatures = () => [];
  const html = addGodotBridge('<html><head></head><body><script>const engine = new Engine({});window.__duckmoleWrapEngine(engine);window.started=engine.startGame({onProgress:window.progress});</script></body></html>',"https://app.example","v1");
  const browser: any = {addEventListener(){},progress:(a:number,b:number)=>progress.push([a,b])};
  const context = {Engine,window:browser,parent:{postMessage:(message:unknown)=>messages.push(message)},document:{addEventListener(){}},HTMLScriptElement:class{}};
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))runInNewContext(script[1],context);
  assert.equal(await browser.started,"real-style-started");assert.deepEqual(progress,[[7,9]]);assert.deepEqual(messages.map(message=>message.event),["progress","ready"]);assert.equal((Engine as any).getMissingFeatures().length,0);
});
test("instance bridge reports a failed start and preserves rejection for the export shell", async () => {
  const messages: any[] = [],failure=new Error("fixture start failed");
  function Engine() { return Object.create({startGame(){return Promise.reject(failure);}}); }
  const browser: any = {addEventListener(){}};
  const html=addGodotBridge('<html><head></head><body><script>let engine = new Engine({});window.started=engine.startGame();</script></body></html>',"https://app.example","v1");
  const context={Engine,window:browser,parent:{postMessage:(message:unknown)=>messages.push(message)},document:{addEventListener(){}},HTMLScriptElement:class{}};
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))runInNewContext(script[1],context);
  await assert.rejects(browser.started,error=>error===failure);assert.deepEqual(messages.map(message=>message.event),["error"]);
});
test("bounded archive-to-encrypted-resource workflow preserves binaries and private policy", () => {
  const files = readGodotArchive(zip(fixture().map((item) => ({ ...item, deflate: true })))), secret = randomBytes(32).toString("hex"), objects = new Map(files.map((file) => [file.path, encryptBuildFile(file.bytes, file.path, secret)]));
  for (const file of files) assert.deepEqual(decryptBuildFile(objects.get(file.path)!, file.path, secret), file.bytes);
  assert.equal(files.find((file) => file.path === "index.pck")?.contentType, "application/octet-stream");
});
