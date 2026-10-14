import { createHash } from "node:crypto";
import { z } from "zod";
import { BUILD_LIMITS } from "./game-build-archive";
// Pure metadata helpers: importing these must never load env, Prisma or S3.
export const storedBuildFilesSchema = z.array(z.object({ path: z.string(), contentType: z.string(), sizeBytes: z.number().int().nonnegative().max(BUILD_LIMITS.fileBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/), storageKey: z.string() })).max(BUILD_LIMITS.files);
export type StoredBuildFile = z.infer<typeof storedBuildFilesSchema>[number];
export function buildStorageKey(gameId: string, versionId: string, path: string) {
    return `encrypted-builds/${gameId}/${versionId}/${createHash("sha256").update(path).digest("hex")}.bin`;
}
