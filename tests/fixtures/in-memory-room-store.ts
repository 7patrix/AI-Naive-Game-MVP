import type { CreationReceipt, RoomRepository, RoomTransaction } from "../../src/lib/game-rooms-service";
import type { GameRoom } from "../../src/lib/game-rooms";
/** Test-only serialized store. Never use process memory as multi-instance production persistence. */
export function inMemoryRoomStore() {
    let rooms = new Map<string, GameRoom>(), creations = new Map<string, CreationReceipt>(), tail = Promise.resolve();
    let rejectNextCommit = false;
    const repository: RoomRepository = { async transaction<T>(operation: (tx: RoomTransaction) => Promise<T> | T): Promise<T> {
            const previous = tail;
            let release!: () => void;
            tail = new Promise<void>(resolve => { release = resolve; });
            await previous;
            try {
                const stagedRooms = structuredClone(rooms), stagedCreations = structuredClone(creations);
                const tx: RoomTransaction = { findRoom: id => { const room = stagedRooms.get(id); return room ? structuredClone(room) : undefined; }, saveRoom: room => { stagedRooms.set(room.id, structuredClone(room)); }, findCreation: (actor, id) => stagedCreations.get(`${actor}/${id}`), saveCreation: receipt => { stagedCreations.set(`${receipt.actorId}/${receipt.requestId}`, structuredClone(receipt)); } };
                const result = await operation(tx);
                if (rejectNextCommit) {
                    rejectNextCommit = false;
                    throw new Error("Mock commit rejected");
                }
                rooms = stagedRooms;
                creations = stagedCreations;
                return result;
            }
            finally {
                release();
            }
        } };
    return { repository, read: (id: string) => structuredClone(rooms.get(id)), count: () => rooms.size, failNextCommit: () => { rejectNextCommit = true; } };
}
