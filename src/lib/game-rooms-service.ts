import { randomBytes, randomUUID } from "node:crypto";
import { applyRoomCommand, createGameRoom, parseCreateRoom, refreshGameRoom, roomCommandSchema, roomRequestFingerprint, roomView, type GameRoom, type RoomActor, type RoomBuild, type RoomResult } from "./game-rooms";
export type CreationReceipt = {
    actorId: string;
    requestId: string;
    fingerprint: string;
    roomId: string;
};
export interface RoomTransaction {
    findRoom(id: string): GameRoom | undefined;
    saveRoom(room: GameRoom): void;
    findCreation(actorId: string, requestId: string): CreationReceipt | undefined;
    saveCreation(receipt: CreationReceipt): void;
    /** Production adapters must read game/version metadata in this same transaction under its game lock. */
    loadBuild?(versionId: string): Promise<RoomBuild | null>;
}
/** Implementations must serialize a room and its receipts, commit atomically and roll back throws. */
export interface RoomRepository {
    transaction<T>(operation: (tx: RoomTransaction) => Promise<T> | T): Promise<T>;
}
export type RoomServiceDependencies = {
    repository: RoomRepository;
    resolveActor: () => Promise<RoomActor | null>;
    loadBuild: (versionId: string) => Promise<RoomBuild | null>;
    now?: () => number;
    newRoomId?: () => string;
    issueInvite?: () => {
        id: string;
        token: string;
    };
};
export function createRoomService(dependencies: RoomServiceDependencies) {
    const { repository, resolveActor, loadBuild } = dependencies;
    const now = dependencies.now ?? Date.now, newRoomId = dependencies.newRoomId ?? randomUUID;
    const issueInvite = dependencies.issueInvite ?? (() => ({ id: randomUUID(), token: randomBytes(32).toString("base64url") }));
    const readBuild = (tx: RoomTransaction, id: string) => tx.loadBuild ? tx.loadBuild(id) : loadBuild(id);
    async function actor() { const current = await resolveActor(); return !current ? { ok: false as const, code: "UNAUTHENTICATED" as const } : !current.verified ? { ok: false as const, code: "UNVERIFIED_ACCOUNT" as const } : current; }
    return {
        async create(input: unknown): Promise<RoomResult> {
            const current = await actor();
            if ("ok" in current)
                return current;
            const parsed = parseCreateRoom(input);
            if (!parsed.success)
                return { ok: false, code: "INVALID_REQUEST" };
            return repository.transaction(async (tx) => {
                const time = now(), fingerprint = roomRequestFingerprint(parsed.data), prior = tx.findCreation(current.userId, parsed.data.requestId);
                if (prior) {
                    if (prior.fingerprint !== fingerprint)
                        return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
                    const room = tx.findRoom(prior.roomId);
                    if (!room)
                        return { ok: false, code: "ROOM_NOT_FOUND" };
                    const refreshed = refreshGameRoom(room, await readBuild(tx, room.versionId), time);
                    tx.saveRoom(refreshed);
                    return { ok: true, room: roomView(refreshed), deduplicated: true };
                }
                const created = createGameRoom(current, parsed.data, await readBuild(tx, parsed.data.versionId), newRoomId(), time);
                if ("code" in created)
                    return { ok: false, code: created.code };
                if (tx.findRoom(created.id))
                    throw new Error("Server room identifier collision.");
                tx.saveRoom(created);
                tx.saveCreation({ actorId: current.userId, requestId: parsed.data.requestId, fingerprint, roomId: created.id });
                return { ok: true, room: roomView(created), deduplicated: false };
            });
        },
        async execute(roomId: string, input: unknown): Promise<RoomResult> {
            const current = await actor();
            if ("ok" in current)
                return current;
            const parsed = roomCommandSchema.safeParse(input);
            if (!parsed.success || !/^[A-Za-z0-9_-]{1,80}$/.test(roomId))
                return { ok: false, code: "INVALID_REQUEST" };
            return repository.transaction(async (tx) => {
                const room = tx.findRoom(roomId);
                if (!room)
                    return { ok: false, code: "ROOM_NOT_FOUND" };
                const transition = applyRoomCommand(room, current, parsed.data, await readBuild(tx, room.versionId), now(), issueInvite);
                tx.saveRoom(transition.next);
                return transition.result;
            });
        },
        async inspect(roomId: string): Promise<RoomResult> {
            const current = await actor();
            if ("ok" in current)
                return current;
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(roomId))
                return { ok: false, code: "INVALID_REQUEST" };
            return repository.transaction(async (tx) => {
                const room = tx.findRoom(roomId);
                if (!room || !room.members.some(row => row.userId === current.userId))
                    return { ok: false, code: "ROOM_NOT_FOUND" };
                const refreshed = refreshGameRoom(room, await readBuild(tx, room.versionId), now());
                tx.saveRoom(refreshed);
                return { ok: true, room: roomView(refreshed), deduplicated: false };
            });
        }
    };
}
