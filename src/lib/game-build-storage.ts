import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";
import { storageClient } from "./storage";
import { type BuildFile } from "./game-build-archive";
import { decryptBuildFile, encryptBuildFile } from "./game-build-security";
import { buildStorageKey, type StoredBuildFile } from "./game-build-manifest";
export { storedBuildFilesSchema, type StoredBuildFile } from "./game-build-manifest";

export async function removeBuildObjects(keys: string[]) {
  const results = await Promise.allSettled(keys.map((Key) => storageClient.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key }))));
  if (results.some((result) => result.status === "rejected")) console.error("Encrypted build cleanup incomplete; reconcile orphan objects before release.");
}
export async function storeBuildFiles(gameId: string, versionId: string, files: BuildFile[]) {
  const uploaded: string[] = [], records: StoredBuildFile[] = [];
  try {
    for (const file of files) {
      const storageKey = buildStorageKey(gameId, versionId, file.path);
      const body = encryptBuildFile(file.bytes, storageKey, env.GAME_BUILD_ENCRYPTION_SECRET);
      uploaded.push(storageKey);
      await storageClient.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey, Body: body, ContentType: "application/octet-stream" }));
      records.push({ path: file.path, contentType: file.contentType, sizeBytes: file.sizeBytes, sha256: file.sha256, storageKey });
    }
    return records;
  } catch (error) { await removeBuildObjects(uploaded); throw error; }
}
export async function readStoredBuildFile(gameId: string, versionId: string, file: StoredBuildFile) {
  const expectedKey = buildStorageKey(gameId, versionId, file.path);
  if (file.storageKey !== expectedKey) throw new Error("Build object identity mismatch.");
  const abortSignal = AbortSignal.timeout(20000);
  const response = await storageClient.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: expectedKey }), { abortSignal });
  const body = response.Body;
  const stream = body as { destroy?: (error?: Error) => void } | undefined;
  const cancelBody = () => stream?.destroy?.(abortSignal.reason instanceof Error ? abortSignal.reason : new Error("Build object read timed out."));
  try {
    if (!body || response.ContentLength !== file.sizeBytes + 32) throw new Error("Build object size mismatch.");
    if (abortSignal.aborted) throw abortSignal.reason;
    abortSignal.addEventListener("abort", cancelBody, { once: true });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > file.sizeBytes + 32) throw new Error("Build object exceeds expected size.");
      chunks.push(Buffer.from(chunk));
    }
    const bytes = decryptBuildFile(Buffer.concat(chunks), expectedKey, env.GAME_BUILD_ENCRYPTION_SECRET);
    if (bytes.length !== file.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Build integrity check failed.");
    return bytes;
  } finally {
    abortSignal.removeEventListener("abort", cancelBody);
    // Headers can fail validation before the Node response stream is consumed.
    stream?.destroy?.();
  }
}
