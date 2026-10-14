import { getCurrentUser, isAdminUser } from "./auth";
import { db } from "./db";
import { createRoomService, type RoomRepository, type RoomServiceDependencies } from "./game-rooms-service";
/** Future server adapter. No route, socket or default persistence is registered by importing it. */
export function createPlatformRoomService(repository: RoomRepository, runtime: Pick<RoomServiceDependencies, "now" | "newRoomId" | "issueInvite"> = {}) {
    return createRoomService({ ...runtime, repository,
        resolveActor: async () => {
            const user = await getCurrentUser();
            return user ? { userId: user.id, verified: Boolean(user.emailVerifiedAt), canHost: isAdminUser(user) } : null;
        },
        loadBuild: async (versionId) => {
            const version = await db.gameVersion.findUnique({ where: { id: versionId }, select: { id: true, gameId: true, versionNumber: true, buildStatus: true, game: { select: { authorId: true, runtime: true, plannedPlayMode: true, status: true, currentVersionNumber: true } } } });
            return version ? { versionId: version.id, gameId: version.gameId, versionNumber: version.versionNumber, buildStatus: version.buildStatus, authorId: version.game.authorId, runtime: version.game.runtime, plannedPlayMode: version.game.plannedPlayMode, gameStatus: version.game.status, currentVersionNumber: version.game.currentVersionNumber } : null;
        }
    });
}
