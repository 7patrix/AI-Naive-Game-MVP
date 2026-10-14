import { createHash } from "node:crypto";
import { z } from "zod";
import { BUILD_LIMITS, validateBuildPath } from "./game-build-archive";
import { buildStorageKey, storedBuildFilesSchema } from "./game-build-manifest";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const prefixPattern = /^encrypted-builds\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
const objectPattern = new RegExp(prefixPattern.source.slice(0, -1) + "/([a-f0-9]{64})\\.bin$");
const timestamp = z.string().datetime({ offset: true });
const identifier = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);
export const reconciliationVersionSchema = z.object({ gameId: identifier, versionId: identifier, versionNumber: z.number().int().positive(), runtime: z.enum(["HTML", "GODOT_WEB"]), gameStatus: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]), buildStatus: z.enum(["DRAFT", "PUBLISHED"]), currentVersionNumber: z.number().int().positive(), storagePrefix: z.string().max(300).nullable().optional(), files: z.unknown() }).refine(row => row.runtime !== "GODOT_WEB" || uuid.test(row.gameId) && uuid.test(row.versionId));
export const reconciliationObjectSchema = z.object({ key: z.string().max(1024), sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), lastModified: z.string().max(80).optional(), etag: z.string().max(256).optional() });
const leaseSchema = z.object({ gameId: z.string().regex(uuid), versionId: z.string().regex(uuid), expiresAt: timestamp });
const captureFailureSchema = z.object({ phase: z.enum(["versions", "objects", "leases"]), page: z.number().int().positive(), attempts: z.number().int().positive(), code: z.enum(["READ_FAILED", "PAGINATION_LOOP", "PAGE_LIMIT_REACHED"]) });
const attemptCountsSchema = z.object({ versions: z.number().int().nonnegative(), objects: z.number().int().nonnegative(), leases: z.number().int().nonnegative() });
export const buildSnapshotSchema = z.object({ schemaVersion: z.literal(1), capture: z.object({ startedAt: timestamp, completedAt: timestamp, databaseComplete: z.boolean(), storageComplete: z.boolean(), uploadLeaseCoverage: z.enum(["unavailable", "complete", "incomplete"]), failures: z.array(captureFailureSchema).max(20).default([]), readAttempts: attemptCountsSchema.default({ versions: 0, objects: 0, leases: 0 }) }), versions: z.array(reconciliationVersionSchema).max(20000), objects: z.array(reconciliationObjectSchema).max(100000), activeUploads: z.array(leaseSchema).max(20000).default([]) }).refine(snapshot => Date.parse(snapshot.capture.startedAt) <= Date.parse(snapshot.capture.completedAt));
export type BuildSnapshot = z.infer<typeof buildSnapshotSchema>;
export type VersionMetadata = z.infer<typeof reconciliationVersionSchema>;
export type ObjectMetadata = z.infer<typeof reconciliationObjectSchema>;
export type UploadLease = z.infer<typeof leaseSchema>;
const statuses = ["referenced", "retained_version_prefix", "in_progress", "possible_upload", "unreferenced_observed", "suspected_orphan", "unknown", "reference_disappeared"] as const;
export type ReconciliationStatus = typeof statuses[number];
const groupSchema = z.object({ prefix: z.string().regex(prefixPattern), gameId: z.string().regex(uuid), versionId: z.string().regex(uuid), status: z.enum(statuses), reasons: z.array(z.string()), safeToDelete: z.literal(false), objectCount: z.number().int().nonnegative(), bytes: z.number().int().nonnegative(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), latestModified: timestamp.nullable(), references: z.array(z.object({ gameId: identifier, versionId: identifier, versionNumber: z.number().int().positive(), retention: z.enum(["current_public", "historical_public", "draft", "archived"]) })), objects: z.array(z.object({ key: z.string().regex(objectPattern), sizeBytes: z.number().int().nonnegative().nullable(), lastModified: timestamp.nullable(), listedInManifest: z.boolean() })), findings: z.array(z.object({ code: z.enum(["MISSING_REFERENCED_OBJECT", "SIZE_MISMATCH", "INVALID_MANIFEST", "INVALID_BINDING", "EXTRA_OBJECT_RETAINED", "UNKNOWN_METADATA", "OBJECT_SIZE_POLICY"]), key: z.string().regex(objectPattern).optional() })) });
export const reconciliationReportSchema = z.object({ schemaVersion: z.literal(1), reportKind: z.literal("READ_ONLY_DRY_RUN"), observedAt: timestamp, generatedAt: timestamp, graceHours: z.number().min(24).max(8760), coverage: z.object({ databaseComplete: z.boolean(), storageComplete: z.boolean(), uploadLeaseCoverage: z.enum(["unavailable", "complete", "incomplete"]), atomic: z.literal(false) }), captureFailures: z.array(captureFailureSchema), readAttempts: attemptCountsSchema, warnings: z.array(z.string()), ignoredObjectCount: z.number().int().nonnegative(), malformedScopeObjects: z.array(z.object({ keyDigest: z.string().regex(/^[a-f0-9]{64}$/), reason: z.literal("UNRECOGNIZED_ENCRYPTED_KEY") })), groups: z.array(groupSchema), deleteActions: z.array(z.never()).length(0) });
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizedTime = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const retention = (version: VersionMetadata): "current_public" | "historical_public" | "draft" | "archived" => version.gameStatus === "ARCHIVED" ? "archived" : version.buildStatus === "DRAFT" || version.gameStatus === "DRAFT" ? "draft" : version.currentVersionNumber === version.versionNumber ? "current_public" : "historical_public";
/** Metadata-only assessment. No object content, service clients, env loader or deletion exists here. */
export function reconcileBuilds(input: unknown, previousInput?: unknown, options: {
    graceHours?: number;
    now?: Date;
} = {}): ReconciliationReport {
    const snapshot = buildSnapshotSchema.parse(input), previous = previousInput === undefined ? undefined : reconciliationReportSchema.parse(previousInput);
    const graceHours = options.graceHours ?? 24;
    if (!Number.isFinite(graceHours) || graceHours < 24 || graceHours > 8760)
        throw new Error("Grace period must be between 24 and 8760 hours.");
    const observedAt = new Date(snapshot.capture.completedAt).toISOString(), observed = Date.parse(observedAt), grace = graceHours * 3600000;
    const rows = new Map<string, VersionMetadata[]>(), objectGroups = new Map<string, ObjectMetadata[]>(), manifests = new Map<string, Array<{
        version: VersionMetadata;
        size: number;
    }>>(), invalidPrefixes = new Map<string, Set<string>>();
    const flag = (prefix: string, reason: string) => { const values = invalidPrefixes.get(prefix) ?? new Set<string>(); values.add(reason); invalidPrefixes.set(prefix, values); };
    for (const version of snapshot.versions.filter(row => row.runtime === "GODOT_WEB")) {
        const prefix = `encrypted-builds/${version.gameId}/${version.versionId}`;
        const prefixRows = rows.get(prefix) ?? [];
        prefixRows.push(version);
        rows.set(prefix, prefixRows);
        if (version.storagePrefix && version.storagePrefix !== prefix) {
            flag(prefix, "INVALID_BINDING");
            if (prefixPattern.test(version.storagePrefix)) {
                const targetRows = rows.get(version.storagePrefix) ?? [];
                targetRows.push(version);
                rows.set(version.storagePrefix, targetRows);
            }
        }
        const parsed = storedBuildFilesSchema.safeParse(version.files);
        if (!parsed.success || !parsed.data.length) {
            flag(prefix, "INVALID_MANIFEST");
            continue;
        }
        const seen = new Set<string>();
        for (const file of parsed.data) {
            const safeKey = objectPattern.test(file.storageKey);
            let validPath = true;
            try {
                validateBuildPath(file.path);
            }
            catch {
                validPath = false;
            }
            if (!validPath || !safeKey || file.storageKey !== buildStorageKey(version.gameId, version.versionId, file.path) || seen.has(file.storageKey))
                flag(prefix, "INVALID_BINDING");
            seen.add(file.storageKey);
            if (safeKey) {
                const bindings = manifests.get(file.storageKey) ?? [];
                bindings.push({ version, size: file.sizeBytes + 32 });
                manifests.set(file.storageKey, bindings);
                const target = file.storageKey.slice(0, file.storageKey.lastIndexOf("/"));
                if (target !== prefix)
                    flag(target, "INVALID_BINDING");
            }
        }
    }
    let ignoredObjectCount = 0;
    const malformedScopeObjects: ReconciliationReport["malformedScopeObjects"] = [];
    for (const object of snapshot.objects) {
        const match = object.key.match(objectPattern);
        if (!match) {
            if (object.key.startsWith("encrypted-builds/"))
                malformedScopeObjects.push({ keyDigest: digest(object.key), reason: "UNRECOGNIZED_ENCRYPTED_KEY" });
            else
                ignoredObjectCount++;
            continue;
        }
        const prefix = `encrypted-builds/${match[1]}/${match[2]}`;
        const prefixObjects = objectGroups.get(prefix) ?? [];
        prefixObjects.push(object);
        objectGroups.set(prefix, prefixObjects);
    }
    const groups: ReconciliationReport["groups"] = [];
    const keysByPrefix = new Map<string, string[]>();
    for (const key of manifests.keys()) {
        const prefix = key.slice(0, key.lastIndexOf("/")), keys = keysByPrefix.get(prefix) ?? [];
        keys.push(key);
        keysByPrefix.set(prefix, keys);
    }
    const prefixes = new Set([...rows.keys(), ...objectGroups.keys(), ...keysByPrefix.keys()]);
    const previousByPrefix = new Map(previous?.groups.map(group => [group.prefix, group]));
    const activePrefixes = new Set(snapshot.activeUploads.filter(lease => Date.parse(lease.expiresAt) > observed).map(lease => `encrypted-builds/${lease.gameId}/${lease.versionId}`));
    const complete = snapshot.capture.databaseComplete && snapshot.capture.storageComplete && snapshot.capture.uploadLeaseCoverage !== "incomplete";
    for (const prefix of [...prefixes].sort()) {
        const match = prefix.match(prefixPattern)!;
        const objects = (objectGroups.get(prefix) ?? []).sort((a, b) => a.key.localeCompare(b.key)), versionRows = rows.get(prefix) ?? [];
        const referencedKeys = keysByPrefix.get(prefix) ?? [], objectKeys = new Set(objects.map(object => object.key));
        const uniqueReferences = new Map<string, VersionMetadata>();
        for (const row of [...versionRows, ...referencedKeys.flatMap(key => manifests.get(key)!.map(item => item.version))]) {
            const identity = `${row.gameId}/${row.versionId}`;
            if (!uniqueReferences.has(identity)) uniqueReferences.set(identity, row);
        }
        const references = [...uniqueReferences.values()].map(version => ({ gameId: version.gameId, versionId: version.versionId, versionNumber: version.versionNumber, retention: retention(version) }));
        const findings: ReconciliationReport["groups"][number]["findings"] = [];
        for (const code of invalidPrefixes.get(prefix) ?? [])
            findings.push({ code: code as "INVALID_MANIFEST" | "INVALID_BINDING" });
        for (const key of referencedKeys)
            if (snapshot.capture.storageComplete && !objectKeys.has(key))
                findings.push({ code: "MISSING_REFERENCED_OBJECT", key });
        const metadata = objects.map(object => ({ key: object.key, sizeBytes: object.sizeBytes ?? null, lastModified: normalizedTime(object.lastModified), listedInManifest: manifests.has(object.key) }));
        for (const object of metadata) {
            const expected = manifests.get(object.key);
            if (expected && object.sizeBytes !== null && expected.some(row => row.size !== object.sizeBytes))
                findings.push({ code: "SIZE_MISMATCH", key: object.key });
            if (references.length && !expected)
                findings.push({ code: "EXTRA_OBJECT_RETAINED", key: object.key });
            if (object.sizeBytes === null || object.lastModified === null)
                findings.push({ code: "UNKNOWN_METADATA", key: object.key });
            if (object.sizeBytes !== null && (object.sizeBytes < 32 || object.sizeBytes > BUILD_LIMITS.fileBytes + 32))
                findings.push({ code: "OBJECT_SIZE_POLICY", key: object.key });
        }
        const times = metadata.map(row => row.lastModified ? Date.parse(row.lastModified) : NaN), latest = times.length && times.every(Number.isFinite) ? times.reduce((maximum, time) => Math.max(maximum, time), -Infinity) : NaN;
        const fingerprint = digest(JSON.stringify(objects.map(object => ({ key: object.key, size: object.sizeBytes ?? null, time: normalizedTime(object.lastModified), etagDigest: object.etag ? digest(object.etag) : null }))));
        const prior = previousByPrefix.get(prefix), reasons: string[] = [];
        let status: ReconciliationStatus;
        const active = activePrefixes.has(prefix);
        if (references.length) {
            status = referencedKeys.length ? "referenced" : "retained_version_prefix";
            reasons.push("ALL_EXISTING_VERSIONS_RETAINED");
            if (findings.some(row => row.code === "EXTRA_OBJECT_RETAINED"))
                reasons.push("EXTRA_OBJECTS_IN_VERSION_PREFIX_RETAINED");
        }
        else if (active) {
            status = "in_progress";
            reasons.push("ACTIVE_UPLOAD_LEASE_PROVIDED");
        }
        else if (!complete) {
            status = "unknown";
            reasons.push("INCOMPLETE_SNAPSHOT");
        }
        else if (!Number.isFinite(latest) || latest > observed + 300000 || metadata.some(row => row.sizeBytes === null || row.sizeBytes < 32 || row.sizeBytes > BUILD_LIMITS.fileBytes + 32) || objectKeys.size !== objects.length) {
            status = "unknown";
            reasons.push("UNRELIABLE_OBJECT_METADATA");
        }
        else if (observed - latest < grace) {
            status = "possible_upload";
            reasons.push("RECENT_PREFIX_MAY_BE_UPLOADING");
        }
        else if (prior?.references.length) {
            status = "reference_disappeared";
            reasons.push("REFERENCE_DISAPPEARED_REQUIRES_REVIEW");
        }
        else if (previous && previous.coverage.databaseComplete && previous.coverage.storageComplete && previous.coverage.uploadLeaseCoverage !== "incomplete" && observed - Date.parse(previous.observedAt) >= grace && prior && prior.fingerprint === fingerprint && ["unreferenced_observed", "suspected_orphan", "possible_upload"].includes(prior.status)) {
            status = "suspected_orphan";
            reasons.push("UNCHANGED_UNREFERENCED_IN_SEPARATED_COMPLETE_OBSERVATIONS");
        }
        else {
            status = "unreferenced_observed";
            reasons.push(prior && prior.fingerprint !== fingerprint ? "OBJECTS_CHANGED_SINCE_PRIOR_OBSERVATION" : "NEEDS_SEPARATED_COMPLETE_OBSERVATION");
        }
        if (!references.length && snapshot.capture.uploadLeaseCoverage !== "complete")
            reasons.push("UPLOAD_STATE_NOT_AUTHORITATIVELY_KNOWN");
        reasons.push("NON_ATOMIC_SNAPSHOT_NO_DELETION_AUTHORIZATION");
        groups.push({ prefix, gameId: match[1], versionId: match[2], status, reasons, safeToDelete: false, objectCount: objects.length, bytes: objects.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0), fingerprint, latestModified: Number.isFinite(latest) ? new Date(latest).toISOString() : null, references, objects: metadata, findings });
    }
    return reconciliationReportSchema.parse({ schemaVersion: 1, reportKind: "READ_ONLY_DRY_RUN", observedAt, generatedAt: (options.now ?? new Date()).toISOString(), graceHours, coverage: { databaseComplete: snapshot.capture.databaseComplete, storageComplete: snapshot.capture.storageComplete, uploadLeaseCoverage: snapshot.capture.uploadLeaseCoverage, atomic: false }, captureFailures: snapshot.capture.failures, readAttempts: snapshot.capture.readAttempts, warnings: ["METADATA_ONLY_CONTENT_NOT_DECRYPTED", "SNAPSHOT_IS_NOT_ATOMIC", ...(snapshot.capture.uploadLeaseCoverage !== "complete" ? ["CURRENT_UPLOADER_HAS_NO_DURABLE_LEASE_EVIDENCE"] : []), ...(!complete ? ["INCOMPLETE_CAPTURE_RETAINS_UNREFERENCED_OBJECTS"] : [])], ignoredObjectCount, malformedScopeObjects, groups, deleteActions: [] });
}
export type Page<T> = {
    items: T[];
    nextCursor?: string;
};
export type SnapshotReaders = {
    readVersionsPage: (cursor: string | undefined) => Promise<Page<VersionMetadata>>;
    readObjectsPage: (prefix: "encrypted-builds/", cursor: string | undefined) => Promise<Page<ObjectMetadata>>;
    readActiveUploadLeases?: () => Promise<UploadLease[]>;
};
/** Adapters are injected by a caller; no default database or storage connector exists. */
export async function collectBuildSnapshot(readers: SnapshotReaders, options: {
    attempts?: number;
    maxPages?: number;
    now?: () => Date;
    retryPause?: () => Promise<void>;
} = {}): Promise<BuildSnapshot> {
    const attempts = options.attempts ?? 3, maxPages = options.maxPages ?? 1000, now = options.now ?? (() => new Date());
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000)
        throw new Error("Invalid capture limits.");
    const failures: BuildSnapshot["capture"]["failures"] = [], readAttempts = { versions: 0, objects: 0, leases: 0 }, startedAt = now().toISOString();
    async function retry<T>(phase: "versions" | "objects" | "leases", page: number, read: () => Promise<T>): Promise<T | undefined> { for (let i = 1; i <= attempts; i++) {
        readAttempts[phase]++;
        try {
            return await read();
        }
        catch {
            if (i === attempts) {
                failures.push({ phase, page, attempts: i, code: "READ_FAILED" });
                return undefined;
            }
            await options.retryPause?.();
        }
    } }
    async function pages<T>(phase: "versions" | "objects", read: (cursor: string | undefined) => Promise<Page<T>>, limit: number) { const items: T[] = [], cursors = new Set<string>(); let cursor: string | undefined; for (let page = 1; page <= maxPages; page++) {
        const result = await retry(phase, page, () => read(cursor));
        if (!result)
            return { items, complete: false };
        items.push(...result.items);
        if (items.length > limit)
            throw new Error("Snapshot metadata exceeds limits.");
        if (!result.nextCursor)
            return { items, complete: true };
        if (cursors.has(result.nextCursor)) {
            failures.push({ phase, page, attempts: 1, code: "PAGINATION_LOOP" });
            return { items, complete: false };
        }
        cursors.add(result.nextCursor);
        cursor = result.nextCursor;
    } failures.push({ phase, page: maxPages, attempts: 1, code: "PAGE_LIMIT_REACHED" }); return { items, complete: false }; }
    const versions = await pages("versions", readers.readVersionsPage, 20000), objects = await pages("objects", cursor => readers.readObjectsPage("encrypted-builds/", cursor), 100000);
    const leases = readers.readActiveUploadLeases ? await retry("leases", 1, readers.readActiveUploadLeases) : undefined;
    return buildSnapshotSchema.parse({ schemaVersion: 1, capture: { startedAt, completedAt: now().toISOString(), databaseComplete: versions.complete, storageComplete: objects.complete, uploadLeaseCoverage: readers.readActiveUploadLeases ? (leases ? "complete" : "incomplete") : "unavailable", failures, readAttempts }, versions: versions.items, objects: objects.items, activeUploads: leases ?? [] });
}
