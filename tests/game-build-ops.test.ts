import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildStorageKey } from "../src/lib/game-build-manifest";
import { collectBuildSnapshot, reconcileBuilds, type BuildSnapshot, type ObjectMetadata, type VersionMetadata } from "../src/lib/game-build-reconciliation";
import { checkDeploymentConfiguration } from "../src/lib/deployment-readiness";
// Metadata fixtures only: these are not a Godot engine, export or playable game.
const gameId = "00000000-0000-0000-0000-000000000001";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const at = "2026-10-06T12:00:00.000Z", later = "2026-10-07T12:00:00.000Z", old = "2026-10-01T12:00:00.000Z";
function version(n = 1, changes: Partial<VersionMetadata> = {}): VersionMetadata {
    const versionId = id(n + 10);
    return { gameId, versionId, versionNumber: n, runtime: "GODOT_WEB", gameStatus: "PUBLISHED", buildStatus: "PUBLISHED", currentVersionNumber: 2, storagePrefix: `encrypted-builds/${gameId}/${versionId}`, files: [{ path: "index.html", contentType: "text/html", sizeBytes: 100, sha256: "0".repeat(64), storageKey: buildStorageKey(gameId, versionId, "index.html") }], ...changes };
}
function object(n = 1, changes: Partial<ObjectMetadata> = {}): ObjectMetadata {
    return { key: buildStorageKey(gameId, id(n + 10), "index.html"), sizeBytes: 132, lastModified: old, etag: "metadata-etag", ...changes };
}
function snapshot(versions: VersionMetadata[] = [], objects: ObjectMetadata[] = [], completedAt = at): BuildSnapshot {
    return { schemaVersion: 1, capture: { startedAt: completedAt, completedAt, databaseComplete: true, storageComplete: true, uploadLeaseCoverage: "unavailable", failures: [], readAttempts: { versions: 1, objects: 1, leases: 0 } }, versions, objects, activeUploads: [] };
}
function verifyNoDeletes(report: ReturnType<typeof reconcileBuilds>) {
    assert.equal(report.reportKind, "READ_ONLY_DRY_RUN");
    assert.deepEqual(report.deleteActions, []);
    assert.ok(report.groups.every(group => group.safeToDelete === false && group.reasons.includes("NON_ATOMIC_SNAPSHOT_NO_DELETION_AUTHORIZATION")));
}
test("current public, old public, draft and archived versions are all retained", () => {
    const rows = [version(1), version(2), version(3, { buildStatus: "DRAFT" }), version(4, { gameStatus: "ARCHIVED" })];
    const report = reconcileBuilds(snapshot(rows, [object(1), object(2), object(3), object(4)]));
    assert.deepEqual(report.groups.map(group => group.references[0].retention), ["historical_public", "current_public", "draft", "archived"]);
    assert.ok(report.groups.every(group => group.status === "referenced"));
    verifyNoDeletes(report);
});
test("invalid manifests and extra resources still protect the entire version prefix", () => {
    const extra = object(1, { key: buildStorageKey(gameId, id(11), "extra.js") });
    const report = reconcileBuilds(snapshot([version(1, { files: null }), version(2)], [object(1), extra, object(2), object(2, { key: buildStorageKey(gameId, id(12), "extra.js") })]));
    assert.equal(report.groups[0].status, "retained_version_prefix");
    assert.ok(report.groups[0].findings.some(row => row.code === "INVALID_MANIFEST"));
    assert.ok(report.groups[1].findings.some(row => row.code === "EXTRA_OBJECT_RETAINED"));
    verifyNoDeletes(report);
});
test("wrong manifest binding retains both original and referenced target prefixes", () => {
    const row = version();
    (row.files as Array<{
        storageKey: string;
    }>)[0].storageKey = object(5).key;
    const report = reconcileBuilds(snapshot([row], [object(1), object(5)]));
    assert.equal(report.groups.length, 2);
    assert.ok(report.groups.every(group => group.references.length && group.findings.some(row => row.code === "INVALID_BINDING")));
    verifyNoDeletes(report);
});
test("missing or incorrectly sized files are findings, never deletion candidates", () => {
    const report = reconcileBuilds(snapshot([version(1), version(2)], [object(2, { sizeBytes: 133 })]));
    assert.ok(report.groups[0].findings.some(row => row.code === "MISSING_REFERENCED_OBJECT"));
    assert.ok(report.groups[1].findings.some(row => row.code === "SIZE_MISMATCH"));
    verifyNoDeletes(report);
    const partial = snapshot([version()], []);
    partial.capture.storageComplete = false;
    assert.ok(!reconcileBuilds(partial).groups[0].findings.some(row => row.code === "MISSING_REFERENCED_OBJECT"));
});
test("a fresh object protects older objects sharing an in-flight prefix", () => {
    const report = reconcileBuilds(snapshot([], [object(), object(1, { key: buildStorageKey(gameId, id(11), "index.wasm"), lastModified: at })]));
    assert.equal(report.groups[0].status, "possible_upload");
    assert.equal(report.groups[0].objectCount, 2);
    verifyNoDeletes(report);
});
test("provided active lease protects even old objects; failed lease capture is unknown", () => {
    const current = snapshot([], [object()]);
    current.capture.uploadLeaseCoverage = "complete";
    current.activeUploads = [{ gameId, versionId: id(11), expiresAt: later }];
    assert.equal(reconcileBuilds(current).groups[0].status, "in_progress");
    current.activeUploads[0].expiresAt = old;
    assert.equal(reconcileBuilds(current).groups[0].status, "unreferenced_observed");
    current.capture.uploadLeaseCoverage = "incomplete";
    assert.equal(reconcileBuilds(current).groups[0].status, "unknown");
});
test("old unreferenced objects require two complete observations at least 24 hours apart", () => {
    const first = reconcileBuilds(snapshot([], [object()]));
    assert.equal(first.groups[0].status, "unreferenced_observed");
    const early = reconcileBuilds(snapshot([], [object()], "2026-10-07T11:59:59.000Z"), first);
    assert.equal(early.groups[0].status, "unreferenced_observed");
    const second = reconcileBuilds(snapshot([], [object()], later), first);
    assert.equal(second.groups[0].status, "suspected_orphan");
    verifyNoDeletes(second);
    assert.ok(second.groups[0].reasons.includes("UPLOAD_STATE_NOT_AUTHORITATIVELY_KNOWN"));
});
test("changed objects, incomplete prior capture and stricter grace reset suspicion", () => {
    const first = reconcileBuilds(snapshot([], [object()]));
    assert.equal(reconcileBuilds(snapshot([], [object(1, { etag: "changed" })], later), first).groups[0].status, "unreferenced_observed");
    const incomplete = snapshot([], [object()]);
    incomplete.capture.databaseComplete = false;
    assert.equal(reconcileBuilds(snapshot([], [object()], later), reconcileBuilds(incomplete)).groups[0].status, "unreferenced_observed");
    assert.equal(reconcileBuilds(snapshot([], [object()], later), first, { graceHours: 48 }).groups[0].status, "unreferenced_observed");
    assert.throws(() => reconcileBuilds(snapshot(), undefined, { graceHours: 0 }));
});
test("a disappearing database reference is retained for explicit review", () => {
    const first = reconcileBuilds(snapshot([version()], [object()]));
    const second = reconcileBuilds(snapshot([], [object()], later), first);
    assert.equal(second.groups[0].status, "reference_disappeared");
    verifyNoDeletes(second);
});
test("a concurrent commit between database and storage reads is first protected then referenced", async () => {
    let committed = false;
    const concurrent = await collectBuildSnapshot({ readVersionsPage: async () => ({ items: committed ? [version()] : [] }), readObjectsPage: async (prefix) => { assert.equal(prefix, "encrypted-builds/"); committed = true; return { items: [object(1, { lastModified: at })] }; } }, { now: () => new Date(at) });
    const first = reconcileBuilds(concurrent);
    assert.equal(first.groups[0].status, "possible_upload");
    const next = await collectBuildSnapshot({ readVersionsPage: async () => ({ items: [version()] }), readObjectsPage: async () => ({ items: [object(1, { lastModified: at })] }) }, { now: () => new Date(later) });
    const final = reconcileBuilds(next, first);
    assert.equal(final.groups[0].status, "referenced");
    verifyNoDeletes(final);
});
test("failed cleanup followed by a new upload retains old successful versions and the retry", () => {
    const rows = [version(1), version(2, { buildStatus: "DRAFT" })], objects = [object(1), object(2), object(9)];
    const first = reconcileBuilds(snapshot(rows, objects)), second = reconcileBuilds(snapshot(rows, objects, later), first);
    assert.deepEqual(second.groups.map(group => group.status), ["referenced", "referenced", "suspected_orphan"]);
    verifyNoDeletes(second);
});
test("failed page reads retry, preserve partial evidence and suppress raw exception text", async () => {
    let reads = 0;
    const captured = await collectBuildSnapshot({ readVersionsPage: async () => { if (++reads < 3)
            throw new Error("secret-sentinel-password"); return { items: [version()] }; }, readObjectsPage: async (_, cursor) => { if (cursor)
            throw new Error("secret-sentinel-token"); return { items: [object(), object(9)], nextCursor: "secret-sentinel-cursor" }; } }, { now: () => new Date(at) });
    assert.equal(captured.capture.readAttempts.versions, 3);
    assert.equal(captured.capture.readAttempts.objects, 4);
    assert.equal(captured.capture.databaseComplete, true);
    assert.equal(captured.capture.storageComplete, false);
    const report = reconcileBuilds(captured);
    assert.equal(report.groups[1].status, "unknown");
    assert.equal(report.captureFailures[0].code, "READ_FAILED");
    assert.ok(!JSON.stringify(report).includes("secret-sentinel"));
    verifyNoDeletes(report);
});
test("successful storage retry does not discard the recovered page", async () => {
    let calls = 0;
    const captured = await collectBuildSnapshot({ readVersionsPage: async () => ({ items: [] }), readObjectsPage: async () => { if (++calls === 1)
            throw Error("transient"); return { items: [object()] }; } }, { now: () => new Date(at) });
    assert.equal(captured.capture.storageComplete, true);
    assert.equal(captured.capture.readAttempts.objects, 2);
    assert.deepEqual(captured.capture.failures, []);
});
test("pagination loops and page limits cannot be treated as complete inventories", async () => {
    const readers = { readVersionsPage: async () => ({ items: [] }), readObjectsPage: async () => ({ items: [object()], nextCursor: "again" }) };
    const loop = await collectBuildSnapshot(readers, { now: () => new Date(at) });
    assert.equal(loop.capture.failures[0].code, "PAGINATION_LOOP");
    assert.equal(reconcileBuilds(loop).groups[0].status, "unknown");
    const bounded = await collectBuildSnapshot(readers, { maxPages: 1, now: () => new Date(at) });
    assert.equal(bounded.capture.failures[0].code, "PAGE_LIMIT_REACHED");
});
test("unknown, future, missing-size and duplicate metadata remains uncertain", () => {
    for (const objects of [[object(1, { lastModified: "invalid" })], [object(1, { lastModified: later })], [object(1, { sizeBytes: undefined })], [object(), object()]])
        assert.equal(reconcileBuilds(snapshot([], objects)).groups[0].status, "unknown");
});
test("HTML scope is ignored and unrecognized storage keys are hashed rather than echoed", () => {
    const report = reconcileBuilds(snapshot([version(1, { runtime: "HTML", files: null })], [{ key: "games/legacy/index.html" }, { key: "encrypted-builds/secret-sentinel-invalid-key" }]));
    assert.equal(report.groups.length, 0);
    assert.equal(report.ignoredObjectCount, 1);
    assert.equal(report.malformedScopeObjects.length, 1);
    assert.ok(!JSON.stringify(report).includes("secret-sentinel"));
});
function config() {
    return { APP_URL: "https://app.invalid", GAME_RUNTIME_URL: "https://games.invalid", GAME_BUILD_ENCRYPTION_SECRET: "A12bC34dE56fG78hI90jK12lM34nO56p", AUTH_SECRET: "Q12rS34tU56vW78xY90zA12bC34dE56f", API_KEY_ENCRYPTION_SECRET: "G12hI34jK56lM78nO90pQ12rS34tU56v", ADMIN_EMAILS: "owner@private.invalid", DATABASE_URL: "postgresql://user:sentinelDBpassword@db.invalid/database", REDIS_URL: "redis://:sentinelRedispassword@cache.invalid:6379", S3_INTERNAL_ENDPOINT: "https://storage.invalid", S3_ENDPOINT: "https://storage.invalid", S3_PUBLIC_BASE_URL: "https://assets.invalid", S3_REGION: "us-east-1", S3_BUCKET: "private-builds", S3_ACCESS_KEY_ID: "sentinelAccessIdentity", S3_SECRET_ACCESS_KEY: "sentinelStorageSecret" };
}
test("preflight names missing fields and rejects placeholders without echoing values", () => {
    const missing = checkDeploymentConfiguration({}, "24.17.0");
    assert.equal(missing.configurationComplete, false);
    assert.ok(missing.missing.includes("GAME_RUNTIME_URL"));
    assert.ok(missing.missing.includes("API_KEY_ENCRYPTION_SECRET"));
    const values = config();
    values.AUTH_SECRET = "changeme-012345678901234567890123456789";
    const report = checkDeploymentConfiguration(values, "24.17.0");
    assert.ok(report.invalid.includes("AUTH_SECRET"));
    assert.ok(!JSON.stringify(report).includes(values.AUTH_SECRET));
});
test("preflight checks origin, key separation and the installed dependency Node requirement", () => {
    const values = config();
    values.GAME_RUNTIME_URL = values.APP_URL;
    values.API_KEY_ENCRYPTION_SECRET = values.AUTH_SECRET;
    const report = checkDeploymentConfiguration(values, "22.18.0");
    assert.ok(report.invalid.includes("GAME_RUNTIME_URL"));
    assert.ok(report.invalid.includes("KEY_PURPOSE_SEPARATION"));
    assert.ok(report.invalid.includes("NODE_RUNTIME"));
});
test("complete syntactic configuration still requires deployment validation, with zero secret output", () => {
    const values = config(), report = checkDeploymentConfiguration(values, "24.17.0"), json = JSON.stringify(report);
    assert.equal(report.configurationComplete, true);
    assert.equal(report.readyForDeployment, false);
    assert.ok(report.manualChecks.length);
    for (const value of Object.values(values))
        assert.ok(!json.includes(value));
    assert.ok(!json.includes("sentinel"));
});
test("CLI accepts only offline snapshots, refuses deletes and does not overwrite reports", () => {
    const root = resolve(import.meta.dirname, ".."), dir = mkdtempSync(join(tmpdir(), "duckmole-ops-"));
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
    for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"])
        if (process.env[key])
            env[key] = process.env[key];
    const run = (script: string, args: string[], extra: Record<string, string> = {}) => spawnSync(process.execPath, ["--require", join(root, "tests/deny-env-reads.cjs"), "--import", pathToFileURL(join(root, "node_modules/tsx/dist/loader.mjs")).href, join(root, "scripts", script), ...args], { cwd: dir, env: { ...env, ...extra }, encoding: "utf8", windowsHide: true });
    try {
        const input = join(dir, "metadata.json"), output = join(dir, "report.json");
        writeFileSync(input, JSON.stringify(snapshot([], [object()])));
        for (const flag of ["--delete", "--apply", "--live"]) {
            const rejected = run("reconcile-builds.ts", ["--snapshot", input, flag, "secret-sentinel"]);
            assert.equal(rejected.status, 2);
            assert.ok(!(rejected.stdout + rejected.stderr).includes("secret-sentinel"));
        }
        const result = run("reconcile-builds.ts", ["--snapshot", input, "--output", output]);
        assert.equal(result.status, 0, result.stderr);
        const report = JSON.parse(readFileSync(output, "utf8"));
        verifyNoDeletes(report);
        const before = readFileSync(output, "utf8");
        assert.equal(run("reconcile-builds.ts", ["--snapshot", input, "--output", output]).status, 2);
        assert.equal(readFileSync(output, "utf8"), before);
        const denied = join(dir, ".env.fixture");
        writeFileSync(denied, "secret-sentinel");
        assert.equal(run("reconcile-builds.ts", ["--snapshot", denied]).status, 2);
        const checked = run("check-deployment.ts", ["--json"], config());
        assert.equal(checked.status, 0, checked.stderr);
        assert.equal(JSON.parse(checked.stdout).readyForDeployment, false);
        assert.ok(!(checked.stdout + checked.stderr).includes("sentinel"));
        const empty = run("check-deployment.ts", ["--json"]);
        assert.equal(empty.status, 2);
        assert.ok(JSON.parse(empty.stdout).missing.includes("GAME_BUILD_ENCRYPTION_SECRET"));
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
