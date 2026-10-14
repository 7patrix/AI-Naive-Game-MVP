import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { deflateRawSync } from "node:zlib";
import { Readable } from "node:stream";
import { runInNewContext } from "node:vm";
import { pathToFileURL } from "node:url";

// Only the temporary test cwd and module mocks may supply configuration. Never read a repository .env.
assert.equal(existsSync(".env"), false, "Run via the isolated test runner.");
const sourceRoot = process.env.DUCKMOLE_TEST_SOURCE_ROOT;
assert.ok(sourceRoot, "Missing explicit source root.");
const source = (path: string) => pathToFileURL(`${sourceRoot}/${path}`).href;
const projectRequire = createRequire(source("package.json"));
const { NextRequest } = await import(source("node_modules/next/server.js"));
type Row = Record<string, any>;
const authorA = { id: "author-a", email: "a@example.test", admin: true }, authorB = { id: "author-b", email: "b@example.test", admin: true };
let actor: typeof authorA | null = authorA;
const config: Row = { APP_URL: "https://studio.example.test", GAME_RUNTIME_URL: "https://play.example.test", GAME_BUILD_ENCRYPTION_SECRET: randomBytes(32).toString("hex"), S3_BUCKET: "fixture-only" };
let data = { games: new Map<string, Row>(), versions: new Map<string, Row>(), sessions: new Map<string, Row>(), audits: [] as Row[] };
let failures = { putAt: 0, putAfterWrite: false, delete: false, version: false, audit: false, size: false, oversized: false, stream: false, hang: false };
let onGet: (() => void) | undefined;
const objects = new Map<string, Buffer>(), storageCalls: string[] = [], bodies: Readable[] = [], locks = new Map<string, Promise<void>>();
let putCount = 0, queryCount = 0;

const gameMatches = (row: Row, where: Row = {}) => ["id", "authorId", "runtime", "status"].every((key) => where[key] === undefined || row[key] === where[key]);
const versionMatches = (row: Row, where: Row = {}) => ["id", "gameId"].every((key) => where[key] === undefined || row[key] === where[key]) && (!where.game || gameMatches(data.games.get(row.gameId)!, where.game));
const sessionMatches = (row: Row, where: Row = {}): boolean => ["versionId", "userId", "tokenHash", "activatedAt"].every((key) => where[key] === undefined || row[key] === where[key]) && (!where.OR || where.OR.some((child: Row)=>sessionMatches(row,child))) && (!where.expiresAt?.lte || row.expiresAt <= where.expiresAt.lte) && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt) && (!where.bootstrapExpiresAt?.gt || row.bootstrapExpiresAt > where.bootstrapExpiresAt.gt) && (!where.bootstrapExpiresAt?.lte || row.bootstrapExpiresAt <= where.bootstrapExpiresAt.lte);
const copy = <T>(row: T): T => structuredClone(row);
const gameDb = {
  async findFirst({ where }: Row) { return copy([...data.games.values()].find((row) => gameMatches(row, where)) ?? null); },
  async findUnique({ where }: Row) { return copy(data.games.get(where.id) ?? null); },
  async create({ data: fields }: Row) { const row = { status: "DRAFT", runtime: "HTML", currentVersionNumber: 1, plannedPlayMode: "SINGLE_PLAYER", ...fields }; data.games.set(row.id, row); return copy(row); },
  async update({ where, data: fields }: Row) { const row = data.games.get(where.id); assert.ok(row); Object.assign(row, fields); return copy(row); }
};
const versionDb = {
  async findFirst({ where, orderBy, include }: Row) {
    let rows = [...data.versions.values()].filter((row) => versionMatches(row, where));
    if (orderBy?.versionNumber === "desc") rows = rows.sort((a, b) => b.versionNumber - a.versionNumber);
    return rows.length ? copy(include?.game ? { ...rows[0], game: data.games.get(rows[0].gameId) } : rows[0]) : null;
  },
  async create({ data: fields }: Row) {
    if (failures.version) throw new Error("fixture version write failed");
    assert.ok(![...data.versions.values()].some((row) => row.gameId === fields.gameId && row.versionNumber === fields.versionNumber));
    const row = { buildStatus: "PUBLISHED", createdAt: new Date(), ...fields }; data.versions.set(row.id, row); return copy(row);
  },
  async update({ where, data: fields }: Row) { const row = data.versions.get(where.id); assert.ok(row); Object.assign(row, fields); return copy(row); }
};
const db: Row = {
  game: gameDb, gameVersion: versionDb,
  buildPreviewSession: {
    async create({ data: fields }: Row) { const row = { id: randomUUID(), activatedAt: null, ...fields }; data.sessions.set(row.tokenHash, row); return copy(row); },
    async count({ where }: Row) { return [...data.sessions.values()].filter((row) => sessionMatches(row, where)).length; },
    async deleteMany({ where }: Row) { let count = 0; for (const [key, row] of data.sessions) if (sessionMatches(row, where)) { data.sessions.delete(key); count++; } return { count }; },
    async updateMany({ where, data: fields }: Row) { let count = 0; for (const row of data.sessions.values()) if (sessionMatches(row, where)) { Object.assign(row, fields); count++; } return { count }; },
    async findUnique({ where, include }: Row) { const row = data.sessions.get(where.tokenHash); if (!row) return null; const version = data.versions.get(row.versionId)!; return copy(include?.version ? { ...row, version: { ...version, game: data.games.get(version.gameId) } } : row); }
  },
  adminAuditLog: { async create({ data: fields }: Row) { if (failures.audit) throw new Error("fixture audit write failed"); data.audits.push(copy(fields)); return fields; } },
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    let release: (() => void) | undefined, snapshot: typeof data | undefined;
    const guarded = (table: Row) => Object.fromEntries(Object.entries(table).map(([name, fn]) => [name, (...args: unknown[]) => { assert.ok(release, "transaction must acquire advisory lock before accessing build data"); return (fn as Function)(...args); }]));
    const tx: Row = { game: guarded(gameDb), gameVersion: guarded(versionDb), buildPreviewSession: guarded(db.buildPreviewSession), adminAuditLog: guarded(db.adminAuditLog), async $queryRaw(strings: TemplateStringsArray, id: string) {
      assert.match(strings.join("?"), /pg_advisory_xact_lock\(hashtext\(\?\)\)/); queryCount++;
      const previous = locks.get(id) ?? Promise.resolve(), gate = new Promise<void>((resolve) => { release = resolve; }); locks.set(id, previous.then(() => gate));
      await previous; snapshot = copy(data); return [{ pg_advisory_xact_lock: "" }];
    } };
    try { return await operation(tx); } catch (error) { if (snapshot) data = snapshot; throw error; } finally { release?.(); }
  }
};
const storageClient = { async send(command: Row) {
  const kind = command.constructor.name, key = command.input.Key; storageCalls.push(kind);
  if (kind === "PutObjectCommand") { putCount++; if (failures.putAt === putCount && !failures.putAfterWrite) throw new Error("fixture storage write failed"); objects.set(key, Buffer.from(command.input.Body)); if (failures.putAt === putCount) throw new Error("fixture ambiguous storage write failed"); return {}; }
  if (kind === "DeleteObjectCommand") { if (failures.delete) throw new Error("fixture delete failed"); objects.delete(key); return {}; }
  assert.equal(kind, "GetObjectCommand"); const bytes = objects.get(key); assert.ok(bytes); onGet?.();
  const body = failures.hang ? new Readable({read(){}}) : failures.stream ? Readable.from((async function* () { yield bytes.subarray(0,10); throw new Error("fixture stream interrupted"); })()) : Readable.from([failures.oversized ? Buffer.concat([bytes, Buffer.from("oversized")]) : bytes]); bodies.push(body);
  return { ContentLength: failures.size ? bytes.length + 1 : bytes.length, Body: body };
} };
mock.module(source("src/lib/env.ts"), { exports: { env: config } });
mock.module(source("src/lib/db.ts"), { exports: { db } });
mock.module(source("src/lib/auth.ts"), { exports: { getCurrentUser: async () => actor, isAdminUser: (user: Row | null) => Boolean(user?.admin), requireAdminUser: async () => actor?.admin ? actor : null } });
mock.module(source("src/lib/storage.ts"), { exports: { storageClient } });
const uploadRoute = await import(source("src/app/api/studio/games/route.ts"));
const previewRoute = await import(source("src/app/api/studio/games/[id]/versions/[versionId]/preview/route.ts"));
const publishRoute = await import(source("src/app/api/studio/games/[id]/versions/[versionId]/publish/route.ts"));
const bootstrapRoute = await import(source("src/app/runtime/bootstrap/route.ts"));
const resourceRoute = await import(source("src/app/runtime/builds/[versionId]/[...path]/route.ts"));
const legacyRoute = await import(source("src/app/api/games/[id]/bundle/route.ts"));
const archive = await import(source("src/lib/game-build-archive.ts"));
const security = await import(source("src/lib/game-build-security.ts"));
const storage = await import(source("src/lib/game-build-storage.ts"));

type Item = { name: string; bytes: Buffer; size?: number; mode?: number; compressed?: Buffer };
function fixture(): Item[] {
  return [
    { name: "index.html", bytes: Buffer.from('<html><head><link rel="stylesheet" href="./assets/style.css"></head><body><h1>TEST FIXTURE — NOT A GODOT GAME</h1><script src="./index.js"></script><script>globalThis.fixtureResult=new Engine().startGame();</script></body></html>') },
    { name: "index.js", bytes: Buffer.from('var Engine=class{startGame(config={}){return Promise.all([fetch("./index.wasm").then(r=>r.arrayBuffer()).then(b=>WebAssembly.compile(b)),fetch("./index.pck").then(r=>r.arrayBuffer()),fetch("./assets/fixture.json").then(r=>r.json())]).then(values=>{config.onProgress?.(3,3);return values[2];});}};') },
    { name: "index.wasm", bytes: Buffer.from([0,97,115,109,1,0,0,0]) },
    { name: "index.pck", bytes: Buffer.from("GDPC TEST FIXTURE ONLY") },
    { name: "assets/fixture.json", bytes: Buffer.from('{"fixtureOnly":true,"engine":"mock"}') },
    { name: "assets/style.css", bytes: Buffer.from("body{color:#142e46}") },
    { name: "index.audio.worklet.js", bytes: Buffer.from("// TEST FIXTURE worklet path") }
  ];
}
function zip(items = fixture()) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name), bytes = item.compressed ?? deflateRawSync(item.bytes), crc = archive.crc32(item.bytes), size = item.size ?? item.bytes.length;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(0x314, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(size, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE((item.mode ?? 0x8000) * 65536, 38); entry.writeUInt32LE(offset, 42);
    locals.push(local, name, bytes); central.push(entry, name); offset += local.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(items.length, 8); end.writeUInt16LE(items.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const context = (gameId: string, versionId: string) => ({ params: Promise.resolve({ id: gameId, versionId }) });
function writeRequest(path: string, body?: BodyInit, contentType?: string) { return new Request(`${config.APP_URL}${path}`, { method: "POST", body, headers: { origin: config.APP_URL, ...(contentType ? { "content-type": contentType } : {}) } }); }
async function upload(gameId?: string, items?: Item[]) {
  const form = new FormData(); for (const [key, value] of Object.entries({ title: "Fixture title", description: "Test-only multi-file export; not a real Godot game.", engineVersion: "mock-fixture", plannedPlayMode: "SINGLE_PLAYER", changeSummary: "Test fixture upload", ...(gameId ? { gameId } : {}) })) form.set(key, value);
  form.set("build", new File([new Uint8Array(zip(items))], "fixture-only.zip", { type: "application/zip" }));
  return uploadRoute.POST(writeRequest("/api/studio/games", form));
}
async function uploaded(gameId?: string) { const response = await upload(gameId); assert.equal(response.status, 201, await response.clone().text()); return response.json() as Promise<Row>; }
async function preview(build: Row) { return previewRoute.POST(writeRequest("/api/studio/preview"), context(build.gameId, build.versionId)); }
async function activate(build: Row) { const response = await preview(build); assert.equal(response.status, 200); const link = (await response.json()).entryUrl; const activated = await bootstrapRoute.GET(new Request(link)); assert.equal(activated.status, 303); return { link, cookie: activated.headers.get("set-cookie")!.split(";")[0], entry: activated.headers.get("location")!, response: activated }; }
function resource(build: Row, path: string, cookie?: string, origin?: string) { return resourceRoute.GET(new NextRequest(`${origin ?? security.gameRuntimeOrigin(config.GAME_RUNTIME_URL ?? "https://play.example.test", build.gameId)}/runtime/builds/${build.versionId}/${path}`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ versionId: build.versionId, path: path.split("/") }) }); }
async function publish(build: Row, confirmed = true) { return publishRoute.POST(writeRequest("/api/studio/publish", JSON.stringify({ verifiedByAuthor: confirmed }), "application/json"), context(build.gameId, build.versionId)); }
beforeEach(() => { actor = authorA; config.GAME_BUILD_ENCRYPTION_SECRET = randomBytes(32).toString("hex"); config.GAME_RUNTIME_URL = "https://play.example.test"; data = { games: new Map(), versions: new Map(), sessions: new Map(), audits: [] }; failures = { putAt: 0, putAfterWrite: false, delete: false, version: false, audit: false, size: false, oversized: false, stream: false, hang: false }; onGet=undefined; objects.clear(); storageCalls.length = 0; bodies.length = 0; locks.clear(); putCount = queryCount = 0; });

test("actual upload preserves all relative files as encrypted private draft resources", async () => {
  const build = await uploaded(); assert.equal(data.games.get(build.gameId)!.status, "DRAFT"); assert.equal(data.versions.get(build.versionId)!.buildStatus, "DRAFT");
  assert.equal(objects.size, fixture().length); assert.ok([...objects.values()].every((bytes) => bytes.subarray(0,4).toString() === "DMG1")); assert.equal((await resource(build, "index.html")).status, 404);
  const session = await activate(build); assert.ok(!session.entry.includes("grant=")); assert.match(session.response.headers.get("set-cookie")!, /HttpOnly/); assert.match(session.response.headers.get("set-cookie")!, /Secure/);
  for (const item of fixture()) { const response = await resource(build, item.name, session.cookie); assert.equal(response.status, 200); if (item.name !== "index.html") assert.deepEqual(Buffer.from(await response.arrayBuffer()), item.bytes); }
});
test("multi-file loading chain runs a clearly labelled mock engine with actual route responses", async () => {
  const build = await uploaded(), session = await activate(build), index = await resource(build, "index.html", session.cookie), html = await index.text();
  assert.match(html, /TEST FIXTURE/); const messages: Row[] = [], requested: string[] = [], scriptLoads: Function[] = []; class Script {};
  const sandbox: Row = { WebAssembly, parent: { postMessage(message: Row, target: string) { assert.equal(target, config.APP_URL); messages.push(message); } }, document: { addEventListener(name: string, callback: Function) { if (name === "load") scriptLoads.push(callback); } }, window: { addEventListener() {} }, HTMLScriptElement: Script,
    fetch: async (relative: string) => { const url = new URL(relative, session.entry); assert.equal(url.origin, new URL(session.entry).origin); const path = url.pathname.split(`/runtime/builds/${build.versionId}/`)[1]; requested.push(path); const response = await resource(build, path, session.cookie); assert.equal(response.status, 200); if (path.endsWith("wasm")) assert.equal(response.headers.get("content-type"), "application/wasm"); if (path.endsWith("pck")) assert.equal(response.headers.get("content-type"), "application/octet-stream"); return response; } };
  for (const match of html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)) {
    if (match[1]) { const path = new URL(match[1], session.entry).pathname.split(`/runtime/builds/${build.versionId}/`)[1]; const js = await resource(build, path, session.cookie); assert.equal(js.headers.get("content-type"), "application/javascript; charset=utf-8"); runInNewContext(await js.text(), sandbox); for (const callback of scriptLoads) callback({ target: new Script() }); }
    else runInNewContext(match[2], sandbox);
  }
  assert.deepEqual(await sandbox.fixtureResult, { fixtureOnly: true, engine: "mock" }); assert.deepEqual(requested.sort(), ["assets/fixture.json", "index.pck", "index.wasm"]); assert.ok(messages.some((message) => message.event === "ready"));
  assert.equal((await resource(build, "assets/style.css", session.cookie)).headers.get("content-type"), "text/css; charset=utf-8");
});
test("ZIP traversal, bombs, aggregate sizes, links and duplicated names never reach storage", async () => {
  const attacks: Item[][] = [
    [...fixture(), { name: "../escape.js", bytes: Buffer.from("x") }], [...fixture(), { name: "%2e%2e/escape.js", bytes: Buffer.from("x") }],
    [...fixture(), { name: "bomb.bin", bytes: Buffer.alloc(2 * 1024 * 1024) }], [...fixture(), { name: "large.bin", bytes: Buffer.from("x"), size: archive.BUILD_LIMITS.fileBytes + 1 }],
    [...fixture(), ...Array.from({length:3}, (_,i) => ({ name: `large${i}.bin`, bytes: Buffer.from("x"), size: archive.BUILD_LIMITS.fileBytes }))],
    [...fixture(), { name: "link.js", bytes: Buffer.from("index.js"), mode: 0xa000 }], [...fixture(), { name: "INDEX.js", bytes: Buffer.from("x") }]
  ];
  for (const items of attacks) { const response = await upload(undefined, items); assert.equal(response.status, 400); assert.equal(objects.size, 0); assert.equal(data.games.size, 0); }
  assert.equal(storageCalls.length, 0);
});
test("compressed bytes, aggregate expansion, entry counts and upload headers enforce their independent limits", async () => {
  assert.throws(()=>archive.readGodotArchive(Buffer.alloc(archive.BUILD_LIMITS.archiveBytes+1)));
  const oversizedDirectory = zip([...fixture(),...Array.from({length:3},(_,i)=>({name:`declared${i}.bin`,bytes:Buffer.from("x"),size:archive.BUILD_LIMITS.fileBytes,compressed:Buffer.alloc(1024*1024)}))]);
  assert.throws(()=>archive.readGodotArchive(oversizedDirectory),/展开后过大/);
  assert.throws(()=>archive.readGodotArchive(zip([...fixture(),...Array.from({length:122},(_,i)=>({name:`entry${i}.txt`,bytes:Buffer.alloc(0)}))])),/文件数量/);
  const request=writeRequest("/api/studio/games","x","multipart/form-data; boundary=fixture"); request.headers.set("content-length",String(archive.BUILD_LIMITS.archiveBytes+1024*1024+1));
  assert.equal((await uploadRoute.POST(request)).status,400); assert.equal(storageCalls.length,0);
});
test("another admin author cannot upload to, preview, revoke or publish this author's game", async () => {
  const build = await uploaded(); actor = authorB;
  assert.equal((await upload(build.gameId)).status, 400); assert.equal((await preview(build)).status, 400); assert.equal((await previewRoute.DELETE(writeRequest("/api/studio/preview"), context(build.gameId,build.versionId))).status, 400); assert.equal((await publish(build)).status, 400);
  assert.equal(data.games.get(build.gameId)!.status, "DRAFT"); assert.equal(data.sessions.size, 0);
});
test("non-admin and anonymous uploads fail before object writes", async () => {
  actor = { ...authorA, admin: false }; assert.equal((await upload()).status, 400); actor = null; assert.equal((await upload()).status, 400); assert.equal(storageCalls.length, 0);
});
test("grant consumption is one-use, cross-game and cross-version reads are denied", async () => {
  const a = await uploaded(), b = await uploaded(), session = await activate(a);
  assert.equal((await bootstrapRoute.GET(new Request(session.link))).status, 404);
  assert.equal((await resource(b, "index.js", session.cookie)).status, 404); assert.equal((await resource(a, "index.js", session.cookie, security.gameRuntimeOrigin(config.GAME_RUNTIME_URL,b.gameId))).status, 404);
  const pending = (await (await preview(b)).json()).entryUrl; const wrongHost = pending.replace(new URL(pending).origin, security.gameRuntimeOrigin(config.GAME_RUNTIME_URL,a.gameId));
  assert.equal((await bootstrapRoute.GET(new Request(wrongHost))).status, 404); assert.equal((await bootstrapRoute.GET(new Request(pending))).status, 303);
});
test("expired bootstrap, expired activated session and revoked cookie all stop access", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1900000000000 }); const build = await uploaded(), grant = (await (await preview(build)).json()).entryUrl;
  t.mock.timers.setTime(1900000061000); assert.equal((await bootstrapRoute.GET(new Request(grant))).status, 404);
  const session = await activate(build); assert.equal((await resource(build,"index.js",session.cookie)).status,200); t.mock.timers.setTime(1900001261001); assert.equal((await resource(build,"index.js",session.cookie)).status,404);
  const fresh = await activate(build); assert.equal((await previewRoute.DELETE(writeRequest("/api/studio/preview"), context(build.gameId,build.versionId))).status,200); assert.equal((await resource(build,"index.js",fresh.cookie)).status,404);
});
test("concurrent preview requests cannot bypass the author's eight-session limit", async () => {
  const a=await uploaded(), b=await uploaded(), responses=await Promise.all(Array.from({length:12},(_,i)=>preview(i%2?a:b)));
  assert.equal(responses.filter((response)=>response.status===200).length,8); assert.equal(data.sessions.size,8); assert.equal(responses.filter((response)=>response.status===400).length,4);
});
test("expired unactivated grants release preview slots after their one-minute validity", async (t) => {
  t.mock.timers.enable({apis:["Date"],now:1900000000000}); const build=await uploaded();
  for(let i=0;i<8;i++) assert.equal((await preview(build)).status,200);
  t.mock.timers.setTime(1900000061000); assert.equal((await preview(build)).status,200); assert.equal(data.sessions.size,1);
});
test("an owner-mismatched preview session is denied even with a valid opaque token", async () => {
  const build = await uploaded(), grant = (await (await preview(build)).json()).entryUrl; const row = [...data.sessions.values()][0]; row.userId = authorB.id;
  assert.equal((await bootstrapRoute.GET(new Request(grant))).status,404); row.activatedAt = new Date(); const token = new URL(grant).searchParams.get("grant")!;
  assert.equal((await resource(build,"index.js", `${security.previewCookieName(build.versionId)}=${token}`)).status,404);
});
test("new uploads preserve published v1; publish and rollback switch the complete current version", async () => {
  const v1 = await uploaded(); assert.equal((await publish(v1,false)).status,400); assert.equal((await publish(v1)).status,200); const v2 = await uploaded(v1.gameId);
  assert.equal(data.games.get(v1.gameId)!.currentVersionNumber,1); assert.equal((await resource(v1,"index.js")).status,200); assert.equal((await resource(v2,"index.js")).status,404);
  assert.equal((await publish(v2)).status,200); assert.equal((await resource(v1,"index.js")).status,404); assert.equal((await resource(v2,"index.js")).status,200);
  assert.equal((await publish(v1)).status,200); assert.equal((await resource(v1,"index.js")).status,200); assert.equal((await resource(v2,"index.js")).status,404); assert.equal(data.audits.length,3);
});
test("concurrent version allocation and publish/rollback obey the advisory-lock transaction protocol", async () => {
  const first = await uploaded(); const builds = await Promise.all(Array.from({length:5}, () => uploaded(first.gameId))); assert.deepEqual(builds.map((row)=>row.versionNumber).sort(),[2,3,4,5,6]);
  const responses = await Promise.all([publish(builds[4]),publish(first),publish(builds[2])]); assert.ok(responses.every((row)=>row.status===200));
  const game = data.games.get(first.gameId)!, winner = [...data.versions.values()].find((row)=>row.gameId===game.id && row.versionNumber===game.currentVersionNumber)!;
  assert.equal(game.title,winner.title); assert.equal(game.bundleUrl,winner.bundleUrl); assert.equal(winner.buildStatus,"PUBLISHED"); assert.equal(game.storagePrefix,winner.storagePrefix); assert.equal(queryCount,9); assert.equal(data.audits.at(-1)!.metadata.versionId,winner.id);
});
test("failed publication audit rolls back the pointer and version status", async () => {
  const v1 = await uploaded(); await publish(v1); const v2 = await uploaded(v1.gameId); failures.audit = true; assert.equal((await publish(v2)).status,503);
  assert.equal(data.games.get(v1.gameId)!.currentVersionNumber,1); assert.equal(data.versions.get(v2.versionId)!.buildStatus,"DRAFT"); assert.equal((await resource(v1,"index.js")).status,200);
});
test("missing or corrupted build objects must not replace a healthy published version", async () => {
  const v1=await uploaded(); await publish(v1); const v2=await uploaded(v1.gameId), file=data.versions.get(v2.versionId)!.buildFiles[1], bytes=Buffer.from(objects.get(file.storageKey)!);
  objects.delete(file.storageKey); assert.equal((await publish(v2)).status,503); assert.equal(data.games.get(v1.gameId)!.currentVersionNumber,1);
  bytes[35]^=1; objects.set(file.storageKey,bytes); assert.equal((await publish(v2)).status,503); assert.equal(data.versions.get(v2.versionId)!.buildStatus,"DRAFT");
});
test("a manifest change during object verification prevents publication", async () => {
  const v1=await uploaded(); await publish(v1); const v2=await uploaded(v1.gameId); onGet=()=>{data.versions.get(v2.versionId)!.buildFiles[1].path="changed.js";onGet=undefined;};
  assert.equal((await publish(v2)).status,400); assert.equal(data.games.get(v1.gameId)!.currentVersionNumber,1); assert.equal(data.versions.get(v2.versionId)!.buildStatus,"DRAFT");
});
test("partial, ambiguous storage failures and database failures remove uploaded ciphertext", async () => {
  failures.putAt=2; assert.equal((await upload()).status,503); assert.equal(objects.size,0); assert.equal(data.games.size,0);
  putCount=0; failures.putAfterWrite=true; assert.equal((await upload()).status,503); assert.equal(objects.size,0);
  failures.putAt=0; failures.version=true; assert.equal((await upload()).status,503); assert.equal(objects.size,0); assert.equal(data.games.size,0);
});
test("cleanup rejection is observable and never makes an incomplete upload public", async (t) => {
  const warnings = t.mock.method(console,"error",()=>{}); failures.putAt=2; failures.delete=true; assert.equal((await upload()).status,503); assert.equal(data.games.size,0); assert.equal(objects.size,1);
  assert.ok(warnings.mock.calls.some((call)=>String(call.arguments[0]).includes("cleanup incomplete")));
});
test("missing encryption key or runtime origin fails safely without changing old publication", async () => {
  const build=await uploaded(); await publish(build); const initialObjects=objects.size; config.GAME_BUILD_ENCRYPTION_SECRET=undefined;
  assert.equal((await upload(build.gameId)).status,400); assert.equal((await preview(build)).status,400); assert.equal((await publish(build)).status,400); assert.equal((await resource(build,"index.js")).status,404); assert.equal(objects.size,initialObjects); assert.equal(data.games.get(build.gameId)!.currentVersionNumber,1);
  config.GAME_BUILD_ENCRYPTION_SECRET=randomBytes(32).toString("hex"); config.GAME_RUNTIME_URL=undefined; assert.equal((await upload()).status,400); assert.equal((await resource(build,"index.js")).status,404);
});
test("invalid stored size closes the S3 response stream instead of leaking a connection", async () => {
  const build=await uploaded(), file=data.versions.get(build.versionId)!.buildFiles[1]; failures.size=true;
  await assert.rejects(storage.readStoredBuildFile(build.gameId,build.versionId,file)); assert.equal(bodies.at(-1)!.destroyed,true);
});
test("tampered ciphertext and oversized body return denial without plaintext", async () => {
  const build=await uploaded(), session=await activate(build), file=data.versions.get(build.versionId)!.buildFiles[1], original=Buffer.from(objects.get(file.storageKey)!);
  objects.get(file.storageKey)![35]^=1; assert.equal((await resource(build,"index.js",session.cookie)).status,404); objects.set(file.storageKey,original); failures.oversized=true; assert.equal((await resource(build,"index.js",session.cookie)).status,404);
});
test("interrupted storage streams close and cannot return partial game code", async () => {
  const build=await uploaded(), session=await activate(build); failures.stream=true; const response=await resource(build,"index.js",session.cookie); assert.equal(response.status,404); assert.equal(await response.text(),"Not found"); assert.equal(bodies.at(-1)!.destroyed,true);
});
test("the read deadline cancels a body stalled after response headers", async (t) => {
  const build=await uploaded(), file=data.versions.get(build.versionId)!.buildFiles[1], controller=new AbortController(); failures.hang=true;
  t.mock.method(AbortSignal,"timeout",(ms:number)=>{assert.equal(ms,20000);return controller.signal;});
  const result=storage.readStoredBuildFile(build.gameId,build.versionId,file).then(()=>false,()=>true); await new Promise(resolve=>setImmediate(resolve));
  controller.abort(new Error("fixture deadline"));
  try { assert.equal(await Promise.race([result,new Promise(resolve=>setTimeout(()=>resolve(false),30))]),true); assert.equal(bodies.at(-1)!.destroyed,true); }
  finally { bodies.at(-1)?.destroy(); }
});
test("legacy GPT HTML bundles retain their route and Godot cannot bypass into same-origin HTML", async (t) => {
  const id=randomUUID(); data.games.set(id,{id,runtime:"HTML",status:"PUBLISHED",bundleUrl:"https://fixture.example.test/generated.html",authorId:authorA.id,currentVersionNumber:1});
  const calls=t.mock.method(globalThis,"fetch",async (url: string | URL | Request)=>{assert.equal(String(url),"https://fixture.example.test/generated.html"); return new Response("<html><head></head><body>GPT fixture</body></html>");});
  const legacy=await legacyRoute.GET(new Request(`${config.APP_URL}/api/games/${id}/bundle`),{params:Promise.resolve({id})}); assert.equal(legacy.status,200); assert.match(await legacy.text(),/GPT fixture/); assert.equal(calls.mock.callCount(),1);
  const godot=await uploaded(); await publish(godot); assert.equal((await legacyRoute.GET(new Request(`${config.APP_URL}/api/games/${godot.gameId}/bundle`),{params:Promise.resolve({id:godot.gameId})})).status,404); assert.equal(calls.mock.callCount(),1);
});
test("the actual GPT publisher stays compatible with the new schema defaults without starting AI or Redis", async (t) => {
  const ts=projectRequire("typescript"), {Prisma,GameStatus}=projectRequire("@prisma/client");
  const fieldDefault=(model:string,field:string)=>Prisma.dmmf.datamodel.models.find((row:Row)=>row.name===model).fields.find((row:Row)=>row.name===field).default;
  assert.equal(fieldDefault("Game","runtime"),"HTML"); assert.equal(fieldDefault("GameVersion","buildStatus"),"PUBLISHED");
  const worker=ts.createSourceFile("index.ts",readFileSync(`${sourceRoot}/workers/generator/index.ts`,"utf8"),ts.ScriptTarget.Latest,true), publisher=worker.statements.find((node:Row)=>ts.isFunctionDeclaration(node)&&node.name?.text==="runPublisherAgent"); assert.ok(publisher);
  const publicObjects=new Map<string,string>(), logs:unknown[][]=[], progress:unknown[][]=[];
  const sandbox:Row={GameStatus,prisma:{game:{async create({data:fields}:Row){const row={id:randomUUID(),runtime:fieldDefault("Game","runtime"),...fields};data.games.set(row.id,row);return row;}},gameVersion:{async create({data:fields}:Row){const row={id:randomUUID(),buildStatus:fieldDefault("GameVersion","buildStatus"),...fields};data.versions.set(row.id,row);return row;}}},
    async uploadObject({key,body}:Row){const url=`https://fixture.example.test/${key}`;publicObjects.set(url,String(body));return {key,url};},generateCoverSvg:()=>"<svg></svg>",buildSlug:(_:string,id:string)=>`fixture-${id}`,buildSearchText:(spec:Row)=>spec.title,generateGameHtml:()=>{throw new Error("Explicit test HTML required");},addLog:async (...args:unknown[])=>{logs.push(args);},writeArtifact:async ()=>"fixture-artifact",updateProgress:async (...args:unknown[])=>{progress.push(args);}};
  runInNewContext(ts.transpileModule(publisher.getText(worker),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,sandbox);
  const result=await sandbox.runPublisherAgent({id:"fixture-job",userId:authorA.id,parentGameId:null,remixSourceVersionId:null,parentGame:null,prompt:"fixture"},{title:"GPT publisher fixture",description:"No AI call",tags:["fixture"]},{html:"<html><head></head><body>GPT publisher fixture</body></html>"},{passed:true},[]);
  assert.equal(data.games.get(result.gameId)!.runtime,"HTML"); assert.equal(data.versions.get(result.versionId)!.buildStatus,"PUBLISHED"); assert.equal(result.versionNumber,1); assert.equal(publicObjects.size,3); assert.equal(logs.length,1); assert.deepEqual(progress,[["fixture-job",95]]);
  t.mock.method(globalThis,"fetch",async (url:string|URL|Request)=>new Response(publicObjects.get(String(url))));
  const response=await legacyRoute.GET(new Request(`${config.APP_URL}/api/games/${result.gameId}/bundle`),{params:Promise.resolve({id:result.gameId})}); assert.equal(response.status,200); assert.match(await response.text(),/GPT publisher fixture/);
});
