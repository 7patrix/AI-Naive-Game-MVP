import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
export const ROOM_LIMITS = { minPlayers: 2, maxPlayers: 8, inviteMinutes: 15, maxInviteMinutes: 30, roomMinutes: 120, maxCommands: 200, maxInvites: 32 } as const;
export type RoomActor = {
    userId: string;
    verified: boolean;
    canHost: boolean;
};
export type RoomBuild = {
    gameId: string;
    versionId: string;
    versionNumber: number;
    currentVersionNumber: number;
    authorId: string;
    runtime: string;
    plannedPlayMode: string;
    gameStatus: string;
    buildStatus: string;
};
export type RoomState = "WAITING" | "RUNNING" | "ENDED" | "CLOSED";
export type RoomCode = "INVALID_REQUEST" | "UNAUTHENTICATED" | "UNVERIFIED_ACCOUNT" | "HOST_FORBIDDEN" | "BUILD_UNAVAILABLE" | "VERSION_MISMATCH" | "ROOM_NOT_FOUND" | "ROOM_CLOSED" | "ROOM_NOT_WAITING" | "ROOM_NOT_RUNNING" | "NOT_MEMBER" | "NOT_HOST" | "ROOM_FULL" | "INVITE_INVALID" | "INVITE_EXPIRED" | "INVITE_USED" | "INVITE_RECIPIENT_MISMATCH" | "ALREADY_MEMBER" | "NOT_ENOUGH_PLAYERS" | "NOT_ALL_READY" | "IDEMPOTENCY_CONFLICT" | "ROOM_COMMAND_LIMIT" | "ROOM_INVITE_LIMIT";
type Invite = {
    id: string;
    recipientUserId: string;
    tokenHash: string;
    expiresAt: number;
    consumedAt: number | null;
    revokedAt: number | null;
};
type Receipt = {
    actorId: string;
    requestId: string;
    fingerprint: string;
    inviteId?: string;
    inviteExpiresAt?: number;
};
export type GameRoom = {
    id: string;
    gameId: string;
    versionId: string;
    versionNumber: number;
    hostUserId: string;
    maxPlayers: number;
    state: RoomState;
    revision: number;
    createdAt: number;
    expiresAt: number;
    startedAt: number | null;
    endedAt: number | null;
    endReason: "HOST_REQUEST" | "PLAYER_LEFT" | null;
    closeReason: "HOST_LEFT" | "EXPIRED" | "VERSION_UNAVAILABLE" | null;
    members: Array<{
        userId: string;
        ready: boolean;
        joinedAt: number;
    }>;
    invites: Invite[];
    receipts: Receipt[];
};
export type RoomView = Omit<GameRoom, "invites" | "receipts">;
export type RoomSuccess = {
    ok: true;
    room: RoomView;
    deduplicated: boolean;
    invite?: {
        id: string;
        expiresAt: number;
        token?: string;
        retryTokenOmitted?: true;
    };
};
export type RoomResult = RoomSuccess | {
    ok: false;
    code: RoomCode;
};
export type RoomTransition = {
    next: GameRoom;
    result: RoomResult;
};
const createSchema = z.object({ requestId: identifier, gameId: identifier, versionId: identifier, maxPlayers: z.number().int().min(2).max(8).default(4), lifetimeMinutes: z.number().int().min(30).max(120).default(120) }).strict();
const common = { requestId: identifier, gameId: identifier, versionId: identifier };
export const roomCommandSchema = z.discriminatedUnion("type", [
    z.object({ ...common, type: z.literal("ISSUE_INVITE"), recipientUserId: identifier, ttlMinutes: z.number().int().min(1).max(30).default(15) }).strict(),
    z.object({ ...common, type: z.literal("JOIN"), inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/) }).strict(),
    z.object({ ...common, type: z.literal("LEAVE") }).strict(),
    z.object({ ...common, type: z.literal("READY"), ready: z.boolean() }).strict(),
    z.object({ ...common, type: z.literal("START") }).strict(),
    z.object({ ...common, type: z.literal("END") }).strict()
]);
export type CreateRoomInput = z.infer<typeof createSchema>;
export type RoomCommand = z.infer<typeof roomCommandSchema>;
export const parseCreateRoom = (input: unknown) => createSchema.safeParse(input);
export const roomTokenHash = (token: string) => createHash("sha256").update("duckmole-room-invite-v1\0").update(token).digest("hex");
export function roomRequestFingerprint(input: CreateRoomInput | RoomCommand) {
    const normalized = Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, key === "inviteToken" ? roomTokenHash(value as string) : value]));
    return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
export function roomView(room: GameRoom): RoomView {
    const { invites: _invites, receipts: _receipts, ...view } = room;
    return structuredClone(view);
}
export function availableRoomBuild(build: RoomBuild | null): build is RoomBuild {
    return Boolean(build && build.runtime === "GODOT_WEB" && ["MULTIPLAYER", "BOTH"].includes(build.plannedPlayMode) && build.gameStatus === "PUBLISHED" && build.buildStatus === "PUBLISHED" && build.versionNumber === build.currentVersionNumber);
}
export function createGameRoom(actor: RoomActor, input: CreateRoomInput, build: RoomBuild | null, roomId: string, now: number): GameRoom | {
    code: RoomCode;
} {
    if (!actor.verified)
        return { code: "UNVERIFIED_ACCOUNT" };
    if (!availableRoomBuild(build) || build.gameId !== input.gameId || build.versionId !== input.versionId)
        return { code: "BUILD_UNAVAILABLE" };
    if (!actor.canHost || build.authorId !== actor.userId)
        return { code: "HOST_FORBIDDEN" };
    return { id: roomId, gameId: build.gameId, versionId: build.versionId, versionNumber: build.versionNumber, hostUserId: actor.userId, maxPlayers: input.maxPlayers, state: "WAITING", revision: 1, createdAt: now, expiresAt: now + input.lifetimeMinutes * 60000, startedAt: null, endedAt: null, endReason: null, closeReason: null, members: [{ userId: actor.userId, ready: false, joinedAt: now }], invites: [], receipts: [] };
}
function close(room: GameRoom, reason: GameRoom["closeReason"], now: number) {
    room.state = "CLOSED";
    room.closeReason = reason;
    room.endedAt = now;
    for (const member of room.members)
        member.ready = false;
    for (const invite of room.invites)
        if (invite.revokedAt === null)
            invite.revokedAt = now;
    room.revision++;
}
/** Passive housekeeping. No timer, socket, credentials, env or service access is created. */
export function refreshGameRoom(input: GameRoom, build: RoomBuild | null, now: number): GameRoom {
    const room = structuredClone(input);
    if (room.state === "WAITING" || room.state === "RUNNING") {
        if (now >= room.expiresAt)
            close(room, "EXPIRED", now);
        else if (!availableRoomBuild(build) || build.gameId !== room.gameId || build.versionId !== room.versionId || build.versionNumber !== room.versionNumber || build.authorId !== room.hostUserId)
            close(room, "VERSION_UNAVAILABLE", now);
    }
    return room;
}
/** Trusted server metadata only. Return `result` to a client, persist `next` inside one transaction. */
export function applyRoomCommand(input: GameRoom, actor: RoomActor, command: RoomCommand, build: RoomBuild | null, now: number, issueInvite: () => {
    id: string;
    token: string;
}): RoomTransition {
    const room = refreshGameRoom(input, build, now);
    const fail = (code: RoomCode): RoomTransition => ({ next: room, result: { ok: false, code } });
    if (!actor.verified)
        return fail("UNVERIFIED_ACCOUNT");
    if (command.gameId !== room.gameId || command.versionId !== room.versionId)
        return fail("VERSION_MISMATCH");
    const member = room.members.find(row => row.userId === actor.userId), host = actor.userId === room.hostUserId;
    const fingerprint = roomRequestFingerprint(command), prior = room.receipts.find(row => row.actorId === actor.userId && row.requestId === command.requestId);
    if (prior) {
        if (!member && command.type !== "LEAVE")
            return fail("NOT_MEMBER");
        if (prior.fingerprint !== fingerprint)
            return fail("IDEMPOTENCY_CONFLICT");
        const view = roomView(room);
        if (!member)
            view.members = [];
        return { next: room, result: { ok: true, room: view, deduplicated: true, ...(prior.inviteId ? { invite: { id: prior.inviteId, expiresAt: prior.inviteExpiresAt!, retryTokenOmitted: true as const } } : {}) } };
    }
    if (command.type !== "JOIN" && !member)
        return fail("NOT_MEMBER");
    if (room.state === "CLOSED")
        return fail(room.closeReason === "VERSION_UNAVAILABLE" ? "BUILD_UNAVAILABLE" : "ROOM_CLOSED");
    if (room.receipts.length >= ROOM_LIMITS.maxCommands && command.type !== "LEAVE")
        return fail("ROOM_COMMAND_LIMIT");
    let invitation: RoomSuccess["invite"];
    if (command.type === "ISSUE_INVITE") {
        if (!host)
            return fail("NOT_HOST");
        if (room.state !== "WAITING")
            return fail("ROOM_NOT_WAITING");
        if (room.members.some(row => row.userId === command.recipientUserId))
            return fail("ALREADY_MEMBER");
        if (room.invites.length >= ROOM_LIMITS.maxInvites)
            return fail("ROOM_INVITE_LIMIT");
        const issued = issueInvite();
        if (!identifier.safeParse(issued.id).success || !z.string().regex(/^[A-Za-z0-9_-]{43,128}$/).safeParse(issued.token).success)
            throw new Error("Invalid server invitation generator.");
        for (const invite of room.invites)
            if (invite.recipientUserId === command.recipientUserId && invite.consumedAt === null && invite.revokedAt === null)
                invite.revokedAt = now;
        const expiresAt = Math.min(room.expiresAt, now + command.ttlMinutes * 60000);
        const tokenHash = roomTokenHash(issued.token);
        if (room.invites.some(invite => invite.id === issued.id || invite.tokenHash === tokenHash))
            throw new Error("Server invitation collision.");
        room.invites.push({ id: issued.id, recipientUserId: command.recipientUserId, tokenHash, expiresAt, consumedAt: null, revokedAt: null });
        invitation = { id: issued.id, expiresAt, token: issued.token };
    }
    else if (command.type === "JOIN") {
        if (room.state !== "WAITING")
            return fail("ROOM_NOT_WAITING");
        if (!member) {
            const hash = roomTokenHash(command.inviteToken), invite = room.invites.find(row => timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash)));
            if (!invite || invite.revokedAt !== null)
                return fail("INVITE_INVALID");
            if (invite.recipientUserId !== actor.userId)
                return fail("INVITE_RECIPIENT_MISMATCH");
            if (now >= invite.expiresAt)
                return fail("INVITE_EXPIRED");
            if (invite.consumedAt !== null)
                return fail("INVITE_USED");
            if (room.members.length >= room.maxPlayers)
                return fail("ROOM_FULL");
            invite.consumedAt = now;
            room.members.push({ userId: actor.userId, ready: false, joinedAt: now });
            for (const row of room.members)
                row.ready = false;
        }
    }
    else if (command.type === "LEAVE") {
        if (host)
            close(room, "HOST_LEFT", now);
        else {
            room.members = room.members.filter(row => row.userId !== actor.userId);
            for (const row of room.members)
                row.ready = false;
            if (room.state === "RUNNING") {
                room.state = "ENDED";
                room.endedAt = now;
                room.endReason = "PLAYER_LEFT";
                for (const invite of room.invites)
                    if (invite.revokedAt === null)
                        invite.revokedAt = now;
            }
        }
    }
    else if (command.type === "READY") {
        if (room.state !== "WAITING")
            return fail("ROOM_NOT_WAITING");
        member!.ready = command.ready;
    }
    else if (command.type === "START") {
        if (!host)
            return fail("NOT_HOST");
        if (room.state !== "WAITING")
            return fail("ROOM_NOT_WAITING");
        if (room.members.length < ROOM_LIMITS.minPlayers)
            return fail("NOT_ENOUGH_PLAYERS");
        if (room.members.some(row => !row.ready))
            return fail("NOT_ALL_READY");
        room.state = "RUNNING";
        room.startedAt = now;
        for (const invite of room.invites)
            if (invite.revokedAt === null)
                invite.revokedAt = now;
    }
    else {
        if (!host)
            return fail("NOT_HOST");
        if (room.state !== "RUNNING")
            return fail("ROOM_NOT_RUNNING");
        room.state = "ENDED";
        room.endedAt = now;
        room.endReason = "HOST_REQUEST";
        for (const row of room.members)
            row.ready = false;
        for (const invite of room.invites)
            if (invite.revokedAt === null)
                invite.revokedAt = now;
    }
    if (room.receipts.length >= ROOM_LIMITS.maxCommands)
        room.receipts.shift();
    room.receipts.push({ actorId: actor.userId, requestId: command.requestId, fingerprint, ...(invitation ? { inviteId: invitation.id, inviteExpiresAt: invitation.expiresAt } : {}) });
    room.revision = input.revision + 1;
    const view = roomView(room);
    if (command.type === "LEAVE" && !host)
        view.members = [];
    return { next: room, result: { ok: true, room: view, deduplicated: false, ...(invitation ? { invite: invitation } : {}) } };
}
