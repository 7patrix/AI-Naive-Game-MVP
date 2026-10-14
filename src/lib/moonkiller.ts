import manifest from "./moonkiller-export.json";
import previousManifest from "./moonkiller-export-previous.json";
const releases: Record<string, { files: typeof manifest.files }> = { [previousManifest.version]: previousManifest, [manifest.version]: manifest };
export const MOONKILLER_VERSION = manifest.version;
export const MOONKILLER_ENTRY = `/moonkiller-assets/${MOONKILLER_VERSION}/index.html`;
export const MOONKILLER_ASSET_DIRECTORY = manifest.assetDirectory;
export const MOONKILLER_DOWNLOAD_MB = Math.ceil(Object.values(manifest.files).reduce((bytes, file) => bytes + file.bytes, 0) / 1_000_000);
export function moonkillerFile(version: string, filename: string) {
  if (!Object.hasOwn(releases, version)) return null;
  const release = releases[version];
  if (!release || !Object.hasOwn(release.files, filename)) return null;
  return release.files[filename as keyof typeof manifest.files];
}
export function moonkillerAssetHeaders(appUrl: string, filename: string, version = MOONKILLER_VERSION) {
  const app = new URL(appUrl).origin, prefix = `${app}/moonkiller-assets/${version}/`;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "null", "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (filename === "index.html") {
    headers["Cache-Control"] = "public, max-age=3600";
    // Every document gets an opaque origin, including direct visits outside the iframe.
    // CORS applies only to this immutable, public file allowlist; credentials are never allowed.
    headers["Content-Security-Policy"] = `sandbox allow-scripts allow-pointer-lock; default-src 'none'; script-src ${prefix} 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src ${prefix} data: blob:; connect-src ${prefix}; media-src ${prefix} blob:; font-src data:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${app}`;
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
  }
  return headers;
}
