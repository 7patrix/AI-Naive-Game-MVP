import test, { beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
assert.equal(existsSync(".env"), false, "Use the isolated runner.");
const root = process.env.DUCKMOLE_TEST_SOURCE_ROOT;
assert.ok(root);
const source = (relative: string) => pathToFileURL(`${root}/${relative}`).href;
type User = {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    admin: boolean;
};
let user: User | null, queryCount = 0;
const binding = { gameId: "game-A", versionId: "version-A" };
let version = { id: binding.versionId, gameId: binding.gameId, versionNumber: 1, buildStatus: "PUBLISHED", game: { authorId: "author", runtime: "GODOT_WEB", plannedPlayMode: "MULTIPLAYER", status: "PUBLISHED", currentVersionNumber: 1 } };
mock.module(source("src/lib/auth.ts"), { exports: { getCurrentUser: async () => user, isAdminUser: (actor: User | null) => Boolean(actor?.admin) } });
mock.module(source("src/lib/db.ts"), { exports: { db: { gameVersion: { findUnique: async ({ where, select }: any) => { queryCount++; assert.deepEqual(where, { id: binding.versionId }); assert.ok(select.game.select.authorId); return structuredClone(version); } } } } });
const { createPlatformRoomService } = await import(source("src/lib/game-rooms-platform.ts"));
const { inMemoryRoomStore } = await import(source("tests/fixtures/in-memory-room-store.ts"));
beforeEach(() => { user = { id: "author", email: "author@fixture.invalid", emailVerifiedAt: new Date(0), admin: true }; queryCount = 0; version = { id: binding.versionId, gameId: binding.gameId, versionNumber: 1, buildStatus: "PUBLISHED", game: { authorId: "author", runtime: "GODOT_WEB", plannedPlayMode: "MULTIPLAYER", status: "PUBLISHED", currentVersionNumber: 1 } }; });
function platform() { const store = inMemoryRoomStore(); let sequence = 0; return { store, service: createPlatformRoomService(store.repository, { now: () => 1000, newRoomId: () => "adapter-room", issueInvite: () => ({ id: `adapter-invite-${++sequence}`, token: `fixture-not-real-adapter-token-${sequence}`.padEnd(48, "x") }) }) }; }
test("the actual platform adapter derives ownership from getCurrentUser and server-loaded version metadata", async () => {
    const h = platform(), result = await h.service.create({ ...binding, requestId: "create" });
    assert.equal(result.ok, true);
    assert.equal(queryCount, 1);
    assert.equal(h.store.read("adapter-room")!.hostUserId, "author");
});
test("anonymous and unverified users fail before a database version lookup", async () => {
    const h = platform();
    user = null;
    assert.deepEqual(await h.service.create({ ...binding, requestId: "create" }), { ok: false, code: "UNAUTHENTICATED" });
    user = { id: "author", email: "fixture@private.invalid", emailVerifiedAt: null, admin: true };
    assert.deepEqual(await h.service.create({ ...binding, requestId: "create" }), { ok: false, code: "UNVERIFIED_ACCOUNT" });
    assert.equal(queryCount, 0);
});
test("admin status does not allow one author to host another author's build", async () => {
    const h = platform();
    user!.id = "other-author";
    assert.deepEqual(await h.service.create({ ...binding, requestId: "create" }), { ok: false, code: "HOST_FORBIDDEN" });
    assert.equal(h.store.count(), 0);
});
test("an invited verified friend joins without administrator status, using the same account resolver", async () => {
    const h = platform();
    assert.equal((await h.service.create({ ...binding, requestId: "create" })).ok, true);
    const invitation = await h.service.execute("adapter-room", { ...binding, type: "ISSUE_INVITE", requestId: "invite", recipientUserId: "friend" });
    assert.equal(invitation.ok, true);
    user = { id: "friend", email: "friend@fixture.invalid", emailVerifiedAt: new Date(0), admin: false };
    const joined = await h.service.execute("adapter-room", { ...binding, type: "JOIN", requestId: "join", inviteToken: (invitation as any).invite.token });
    assert.equal(joined.ok, true);
    assert.equal(h.store.read("adapter-room")!.members.length, 2);
});
test("client-supplied host identity is rejected and server publication changes close the bound room", async () => {
    const h = platform();
    assert.deepEqual(await h.service.create({ ...binding, requestId: "spoof", hostUserId: "other" }), { ok: false, code: "INVALID_REQUEST" });
    assert.equal(queryCount, 0);
    assert.equal((await h.service.create({ ...binding, requestId: "create" })).ok, true);
    version.game.currentVersionNumber = 2;
    assert.deepEqual(await h.service.execute("adapter-room", { ...binding, type: "READY", requestId: "ready", ready: true }), { ok: false, code: "BUILD_UNAVAILABLE" });
    assert.equal(h.store.read("adapter-room")!.closeReason, "VERSION_UNAVAILABLE");
});
