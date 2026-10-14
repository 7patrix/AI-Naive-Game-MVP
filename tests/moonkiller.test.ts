import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import manifest from "../src/lib/moonkiller-export.json";
import { moonkillerFile, moonkillerAssetHeaders, MOONKILLER_VERSION } from "../src/lib/moonkiller";
test("curated public export only exposes the exact accepted file allowlist", () => {
  assert.equal(moonkillerFile(MOONKILLER_VERSION, "index.pck")?.bytes, 58157872);
  for (const name of ["../index.html", "qa.html", "index.png.import", "__proto__", "constructor", "unknown.wasm"]) assert.equal(moonkillerFile(MOONKILLER_VERSION, name), null);
  assert.equal(moonkillerFile("older-export", "index.html"), null);
});
test("curated runtime remains opaque even when opened directly and cannot access app or external connections", () => {
  const h = moonkillerAssetHeaders("https://duckmole.site", "index.html"), csp = h["Content-Security-Policy"];
  assert.ok(csp.startsWith("sandbox allow-scripts allow-pointer-lock;"));
  assert.ok(!csp.includes("allow-same-origin"));
  assert.ok(csp.includes(`connect-src https://duckmole.site/moonkiller-assets/${MOONKILLER_VERSION}/;`));
  assert.ok(csp.includes("worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors https://duckmole.site"));
  assert.equal(h["Access-Control-Allow-Origin"], "null");
  assert.equal(h["Access-Control-Allow-Credentials"], undefined);
});
test("all eight published files match the accepted export hashes and contain no QA entry", () => {
  assert.equal(Object.keys(manifest.files).length, 8);
  for (const [name, file] of Object.entries(manifest.files)) {
    const bytes = readFileSync(path.join(process.cwd(), manifest.assetDirectory, manifest.version, name));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
  const html = readFileSync(path.join(process.cwd(), manifest.assetDirectory, manifest.version, "index.html"), "utf8");
  assert.ok(html.includes("const GODOT_THREADS_ENABLED = false"));
  assert.ok(!html.includes('"serviceWorker":'));
});
