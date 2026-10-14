import test from "node:test";
import assert from "node:assert/strict";
import { createRoomService } from "../src/lib/game-rooms-service";
import type { RoomRepository } from "../src/lib/game-rooms-service";
import { ROOM_LIMITS, roomTokenHash, type RoomActor, type RoomBuild, type RoomResult, type RoomSuccess } from "../src/lib/game-rooms";
import { inMemoryRoomStore } from "./fixtures/in-memory-room-store";
const owner: RoomActor = { userId: "author", verified: true, canHost: true };
const friend: RoomActor = { userId: "friend", verified: true, canHost: false };
const second: RoomActor = { userId: "second-friend", verified: true, canHost: false };
const outsider: RoomActor = { userId: "outsider", verified: true, canHost: true };
const binding = { gameId: "game-A", versionId: "version-A" };
const good = (result: RoomResult): RoomSuccess => { assert.equal(result.ok, true, JSON.stringify(result)); return result as RoomSuccess; };
const rejects = (result: RoomResult, code: string) => { assert.deepEqual(result, { ok: false, code }); };
function setup() {
    const store = inMemoryRoomStore();
    let time = 1000000, roomSequence = 0, inviteSequence = 0, requestSequence = 0;
    let build: RoomBuild | null = { ...binding, versionNumber: 2, currentVersionNumber: 2, authorId: owner.userId, runtime: "GODOT_WEB", plannedPlayMode: "MULTIPLAYER", gameStatus: "PUBLISHED", buildStatus: "PUBLISHED" };
    const service = (actor: RoomActor | null) => createRoomService({ repository: store.repository, resolveActor: async () => actor, loadBuild: async () => structuredClone(build), now: () => time, newRoomId: () => `room-${++roomSequence}`, issueInvite: () => ({ id: `invite-${++inviteSequence}`, token: `fixture-not-real-invitation-${inviteSequence}`.padEnd(48, "x") }) });
    const execute = (id: string, actor: RoomActor, type: string, fields: Record<string, unknown> = {}, requestId = `request-${++requestSequence}`) => service(actor).execute(id, { ...binding, requestId, type, ...fields });
    const open = async (maxPlayers = 4, fields: Record<string, unknown> = {}) => good(await service(owner).create({ ...binding, requestId: `create-${++requestSequence}`, maxPlayers, ...fields })).room;
    const invite = async (id: string, recipient = friend, fields: Record<string, unknown> = {}) => good(await execute(id, owner, "ISSUE_INVITE", { recipientUserId: recipient.userId, ...fields })).invite!;
    const join = async (id: string, recipient = friend, fields: Record<string, unknown> = {}) => { const issued = await invite(id, recipient); return good(await execute(id, recipient, "JOIN", { inviteToken: issued.token, ...fields })); };
    const ready = async (id: string, actor = owner) => good(await execute(id, actor, "READY", { ready: true }));
    const running = async () => { const room = await open(); await join(room.id); await ready(room.id); await ready(room.id, friend); good(await execute(room.id, owner, "START")); return room.id; };
    return { store, service, execute, open, invite, join, ready, running, build: () => build, setBuild: (next: RoomBuild | null) => { build = next; }, advance: (milliseconds: number) => { time += milliseconds; }, counts: () => ({ rooms: roomSequence, invites: inviteSequence }) };
}
test("only a verified owner admin can create a room for a current public multiplayer Godot build", async () => {
    const h = setup();
    rejects(await h.service(null).create({ ...binding, requestId: "new" }), "UNAUTHENTICATED");
    rejects(await h.service({ ...owner, verified: false }).create({ ...binding, requestId: "new" }), "UNVERIFIED_ACCOUNT");
    rejects(await h.service(friend).create({ ...binding, requestId: "new" }), "HOST_FORBIDDEN");
    rejects(await h.service(outsider).create({ ...binding, requestId: "new" }), "HOST_FORBIDDEN");
    const room = await h.open();
    assert.equal(room.hostUserId, owner.userId);
    assert.equal(room.state, "WAITING");
    assert.equal(room.members[0].ready, false);
});
test("single-player, HTML, draft, archived, old or mismatched build metadata cannot create rooms", async () => {
    for (const changes of [{ plannedPlayMode: "SINGLE_PLAYER" }, { runtime: "HTML" }, { gameStatus: "DRAFT" }, { gameStatus: "ARCHIVED" }, { buildStatus: "DRAFT" }, { currentVersionNumber: 3 }, { gameId: "other-game" }, { versionId: "other-version" }]) {
        const h = setup();
        h.setBuild({ ...h.build()!, ...changes });
        rejects(await h.service(owner).create({ ...binding, requestId: "new" }), "BUILD_UNAVAILABLE");
        assert.equal(h.store.count(), 0);
    }
    const h = setup();
    h.setBuild({ ...h.build()!, plannedPlayMode: "BOTH" });
    assert.equal((await h.open()).state, "WAITING");
});
test("player, room lifetime and invite lifetime limits are checked without trusting client identity", async () => {
    for (const maxPlayers of [0, 1, 9, 3.5]) {
        const h = setup();
        rejects(await h.service(owner).create({ ...binding, requestId: "new", maxPlayers }), "INVALID_REQUEST");
    }
    const h = setup();
    rejects(await h.service(owner).create({ ...binding, requestId: "new", hostUserId: outsider.userId }), "INVALID_REQUEST");
    rejects(await h.service(owner).create({ ...binding, requestId: "new", lifetimeMinutes: 121 }), "INVALID_REQUEST");
    const room = await h.open();
    rejects(await h.execute(room.id, owner, "ISSUE_INVITE", { recipientUserId: friend.userId, ttlMinutes: 31 }), "INVALID_REQUEST");
    rejects(await h.execute(room.id, friend, "READY", { ready: true, userId: owner.userId }), "INVALID_REQUEST");
});
test("concurrent duplicate create requests allocate exactly one room", async () => {
    const h = setup(), input = { ...binding, requestId: "same-create" };
    const results = await Promise.all([h.service(owner).create(input), h.service(owner).create(input)]);
    assert.equal(good(results[0]).room.id, good(results[1]).room.id);
    assert.equal(h.store.count(), 1);
    assert.equal(good(results[1]).deduplicated, true);
    rejects(await h.service(owner).create({ ...input, maxPlayers: 8 }), "IDEMPOTENCY_CONFLICT");
});
test("invites are short-lived, account-bound and stored only as hashes", async () => {
    const h = setup(), room = await h.open(), issued = await h.invite(room.id);
    const internal = h.store.read(room.id)!;
    assert.equal(internal.invites[0].tokenHash, roomTokenHash(issued.token!));
    assert.ok(!JSON.stringify(internal).includes(issued.token!));
    assert.equal(issued.expiresAt - room.createdAt, 15 * 60000);
    const view = good(await h.service(owner).inspect(room.id)).room;
    assert.ok(!JSON.stringify(view).includes("tokenHash"));
    assert.ok(!("invites" in view));
    assert.ok(!("receipts" in view));
});
test("invite retries do not create extra tokens or persist plaintext for replay", async () => {
    const h = setup(), room = await h.open(), fields = { recipientUserId: friend.userId };
    const first = good(await h.execute(room.id, owner, "ISSUE_INVITE", fields, "same-invite")), retry = good(await h.execute(room.id, owner, "ISSUE_INVITE", fields, "same-invite"));
    assert.equal(h.counts().invites, 1);
    assert.equal(retry.invite!.id, first.invite!.id);
    assert.equal(retry.invite!.token, undefined);
    assert.equal(retry.invite!.retryTokenOmitted, true);
    assert.equal(retry.deduplicated, true);
});
test("a new invitation for the same recipient revokes the old one", async () => {
    const h = setup(), room = await h.open(), first = await h.invite(room.id), secondInvite = await h.invite(room.id);
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: first.token }), "INVITE_INVALID");
    assert.equal(good(await h.execute(room.id, friend, "JOIN", { inviteToken: secondInvite.token })).room.members.length, 2);
});
test("wrong recipient, expired and unknown invitations cannot join", async () => {
    const h = setup(), room = await h.open(), issued = await h.invite(room.id, friend, { ttlMinutes: 1 });
    rejects(await h.execute(room.id, second, "JOIN", { inviteToken: issued.token }), "INVITE_RECIPIENT_MISMATCH");
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: "unknown-fixture-token".padEnd(48, "x") }), "INVITE_INVALID");
    h.advance(60000);
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: issued.token }), "INVITE_EXPIRED");
    assert.equal(h.store.read(room.id)!.members.length, 1);
});
test("unauthenticated or unverified friends cannot join or inspect", async () => {
    const h = setup(), room = await h.open(), issued = await h.invite(room.id);
    rejects(await h.service(null).execute(room.id, { ...binding, requestId: "join", type: "JOIN", inviteToken: issued.token }), "UNAUTHENTICATED");
    rejects(await h.service({ ...friend, verified: false }).execute(room.id, { ...binding, requestId: "join", type: "JOIN", inviteToken: issued.token }), "UNVERIFIED_ACCOUNT");
    rejects(await h.service(outsider).inspect(room.id), "ROOM_NOT_FOUND");
});
test("cross-game, cross-version and cross-room invitations are rejected", async () => {
    const h = setup(), room = await h.open(), other = await h.open(), issued = await h.invite(room.id);
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: issued.token, gameId: "game-B" }), "VERSION_MISMATCH");
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: issued.token, versionId: "version-B" }), "VERSION_MISMATCH");
    rejects(await h.execute(other.id, friend, "JOIN", { inviteToken: issued.token }), "INVITE_INVALID");
    assert.equal(h.store.read(room.id)!.invites[0].consumedAt, null);
});
test("concurrent last-slot joins cannot overfill the room or consume the rejected invite", async () => {
    const h = setup(), room = await h.open(2), a = await h.invite(room.id), b = await h.invite(room.id, second);
    const results = await Promise.all([h.execute(room.id, friend, "JOIN", { inviteToken: a.token }), h.execute(room.id, second, "JOIN", { inviteToken: b.token })]);
    assert.equal(results.filter(row => row.ok).length, 1);
    assert.equal(h.store.read(room.id)!.members.length, 2);
    assert.ok(results.some(row => !row.ok && row.code === "ROOM_FULL"));
    assert.equal(h.store.read(room.id)!.invites.filter(row => row.consumedAt !== null).length, 1);
});
test("duplicate joins are idempotent and retries with different payloads conflict", async () => {
    const h = setup(), room = await h.open(), issued = await h.invite(room.id), fields = { inviteToken: issued.token };
    const first = good(await h.execute(room.id, friend, "JOIN", fields, "join-once")), retry = good(await h.execute(room.id, friend, "JOIN", fields, "join-once"));
    assert.equal(first.room.revision, retry.room.revision);
    assert.equal(retry.deduplicated, true);
    assert.equal(retry.room.members.length, 2);
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: "different-fixture-token".padEnd(48, "x") }, "join-once"), "IDEMPOTENCY_CONFLICT");
});
test("all players must prepare and only the host can start", async () => {
    const h = setup(), room = await h.open();
    await h.ready(room.id);
    rejects(await h.execute(room.id, owner, "START"), "NOT_ENOUGH_PLAYERS");
    await h.join(room.id);
    assert.ok(h.store.read(room.id)!.members.every(row => !row.ready));
    rejects(await h.execute(room.id, friend, "START"), "NOT_HOST");
    await h.ready(room.id);
    rejects(await h.execute(room.id, owner, "START"), "NOT_ALL_READY");
    await h.ready(room.id, friend);
    assert.equal(good(await h.execute(room.id, owner, "START")).room.state, "RUNNING");
});
test("ready can be withdrawn and roster changes clear old ready signals", async () => {
    const h = setup(), room = await h.open();
    await h.join(room.id);
    await h.ready(room.id);
    await h.ready(room.id, friend);
    good(await h.execute(room.id, friend, "READY", { ready: false }));
    rejects(await h.execute(room.id, owner, "START"), "NOT_ALL_READY");
    await h.ready(room.id, friend);
    await h.join(room.id, second);
    assert.ok(h.store.read(room.id)!.members.every(row => !row.ready));
});
test("concurrent starts with the same request execute exactly once", async () => {
    const h = setup(), room = await h.open();
    await h.join(room.id);
    await h.ready(room.id);
    await h.ready(room.id, friend);
    const result = await Promise.all([h.execute(room.id, owner, "START", {}, "start-once"), h.execute(room.id, owner, "START", {}, "start-once")]);
    assert.equal(good(result[0]).room.state, "RUNNING");
    assert.equal(good(result[1]).deduplicated, true);
    assert.equal(good(result[0]).room.revision, good(result[1]).room.revision);
});
test("running rooms reject joins, readiness changes and invitations", async () => {
    const h = setup(), id = await h.running();
    rejects(await h.execute(id, friend, "READY", { ready: false }), "ROOM_NOT_WAITING");
    rejects(await h.execute(id, owner, "ISSUE_INVITE", { recipientUserId: second.userId }), "ROOM_NOT_WAITING");
    rejects(await h.execute(id, second, "JOIN", { inviteToken: "unused-fixture-token".padEnd(48, "x") }), "ROOM_NOT_WAITING");
});
test("the host can end a running room; ended rooms cannot restart", async () => {
    const h = setup(), id = await h.running();
    rejects(await h.execute(id, friend, "END"), "NOT_HOST");
    const ended = good(await h.execute(id, owner, "END", {}, "end-once"));
    assert.equal(ended.room.state, "ENDED");
    assert.equal(ended.room.endReason, "HOST_REQUEST");
    assert.equal(good(await h.execute(id, owner, "END", {}, "end-once")).deduplicated, true);
    rejects(await h.execute(id, owner, "START"), "ROOM_NOT_WAITING");
});
test("end before start and non-member controls are rejected", async () => {
    const h = setup(), room = await h.open();
    rejects(await h.execute(room.id, owner, "END"), "ROOM_NOT_RUNNING");
    for (const type of ["LEAVE", "START", "END"])
        rejects(await h.execute(room.id, outsider, type), "NOT_MEMBER");
    rejects(await h.execute(room.id, outsider, "READY", { ready: true }), "NOT_MEMBER");
});
test("waiting guest leave frees the slot, resets ready and cannot reuse its consumed invitation", async () => {
    const h = setup(), room = await h.open(2), issued = await h.invite(room.id);
    good(await h.execute(room.id, friend, "JOIN", { inviteToken: issued.token }));
    await h.ready(room.id);
    const left = good(await h.execute(room.id, friend, "LEAVE", {}, "leave-once"));
    assert.deepEqual(left.room.members, []);
    assert.equal(h.store.read(room.id)!.members.length, 1);
    assert.equal(h.store.read(room.id)!.members[0].ready, false);
    const retried = good(await h.execute(room.id, friend, "LEAVE", {}, "leave-once"));
    assert.equal(retried.deduplicated, true);
    assert.deepEqual(retried.room.members, []);
    rejects(await h.service(friend).inspect(room.id), "ROOM_NOT_FOUND");
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: issued.token }), "INVITE_USED");
    await h.join(room.id, second);
});
test("host leave closes waiting and running rooms without transfer", async () => {
    for (const running of [false, true]) {
        const h = setup(), id = running ? await h.running() : (await h.open()).id;
        const result = good(await h.execute(id, owner, "LEAVE", {}, "host-leaves"));
        assert.equal(result.room.state, "CLOSED");
        assert.equal(result.room.closeReason, "HOST_LEFT");
        assert.equal(result.room.hostUserId, owner.userId);
        assert.equal(good(await h.execute(id, owner, "LEAVE", {}, "host-leaves")).deduplicated, true);
        rejects(await h.execute(id, owner, "START"), "ROOM_CLOSED");
        assert.ok(h.store.read(id)!.invites.every(row => row.revokedAt !== null));
    }
});
test("a guest leaving a running room ends the round instead of silently changing the roster", async () => {
    const h = setup(), id = await h.running();
    good(await h.execute(id, friend, "LEAVE"));
    const room = h.store.read(id)!;
    assert.equal(room.state, "ENDED");
    assert.equal(room.endReason, "PLAYER_LEFT");
    assert.equal(room.members.length, 1);
});
test("room expiry closes atomically and pending invitations cannot outlive the room", async () => {
    const h = setup(), room = await h.open(4, { lifetimeMinutes: 30 });
    h.advance(29 * 60000);
    const issued = await h.invite(room.id);
    assert.equal(issued.expiresAt, room.expiresAt);
    h.advance(60000);
    rejects(await h.execute(room.id, friend, "JOIN", { inviteToken: issued.token }), "ROOM_CLOSED");
    assert.equal(h.store.read(room.id)!.closeReason, "EXPIRED");
});
test("unpublication, version switch or lost build closes existing rooms without rebinding", async () => {
    for (const unavailable of [null, { currentVersionNumber: 3 }, { gameStatus: "ARCHIVED" }, { buildStatus: "DRAFT" }, { authorId: "different-author" }]) {
        const h = setup(), id = await h.running();
        h.setBuild(unavailable === null ? null : { ...h.build()!, ...unavailable });
        rejects(await h.execute(id, owner, "END"), "BUILD_UNAVAILABLE");
        const room = h.store.read(id)!;
        assert.equal(room.state, "CLOSED");
        assert.equal(room.versionId, binding.versionId);
        assert.equal(room.closeReason, "VERSION_UNAVAILABLE");
    }
});
test("repository failures roll back membership and token consumption, allowing a safe retry", async () => {
    const h = setup(), room = await h.open(), issued = await h.invite(room.id);
    h.store.failNextCommit();
    await assert.rejects(h.execute(room.id, friend, "JOIN", { inviteToken: issued.token }, "retry-join"), /Mock commit/);
    assert.equal(h.store.read(room.id)!.members.length, 1);
    assert.equal(h.store.read(room.id)!.invites[0].consumedAt, null);
    assert.equal(good(await h.execute(room.id, friend, "JOIN", { inviteToken: issued.token }, "retry-join")).room.members.length, 2);
});
test("bounded receipts and invite counts prevent unbounded room state growth", async () => {
    const h = setup(), room = await h.open();
    for (let i = 0; i < ROOM_LIMITS.maxInvites; i++)
        await h.invite(room.id, friend);
    rejects(await h.execute(room.id, owner, "ISSUE_INVITE", { recipientUserId: friend.userId }), "ROOM_INVITE_LIMIT");
    for (let i = ROOM_LIMITS.maxInvites; i < ROOM_LIMITS.maxCommands; i++)
        good(await h.execute(room.id, owner, "READY", { ready: Boolean(i % 2) }));
    rejects(await h.execute(room.id, owner, "READY", { ready: true }), "ROOM_COMMAND_LIMIT");
    assert.equal(good(await h.execute(room.id, owner, "LEAVE")).room.state, "CLOSED");
    assert.equal(h.store.read(room.id)!.receipts.length, ROOM_LIMITS.maxCommands);
});
test("transaction-provided version reads take precedence over the non-atomic fallback", async () => {
    const store = inMemoryRoomStore();
    let reads = 0;
    const build: RoomBuild = { ...binding, versionNumber: 1, currentVersionNumber: 1, authorId: owner.userId, runtime: "GODOT_WEB", plannedPlayMode: "MULTIPLAYER", gameStatus: "PUBLISHED", buildStatus: "PUBLISHED" };
    const repository: RoomRepository = { transaction: operation => store.repository.transaction(tx => operation({ ...tx, loadBuild: async () => { reads++; return structuredClone(build); } })) };
    const service = createRoomService({ repository, resolveActor: async () => owner, loadBuild: async () => { throw Error("Non-atomic fallback must not be used"); }, newRoomId: () => "transaction-room", now: () => 1000 });
    good(await service.create({ ...binding, requestId: "create" }));
    good(await service.execute("transaction-room", { ...binding, requestId: "ready", type: "READY", ready: true }));
    good(await service.inspect("transaction-room"));
    assert.equal(reads, 3);
});
