import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const BUILD_LIMITS = { archiveBytes: 32 * 1024 * 1024, fileBytes: 64 * 1024 * 1024, totalBytes: 128 * 1024 * 1024, files: 128 };
export class BuildInputError extends Error {}
export type BuildFile = { path: string; contentType: string; sizeBytes: number; sha256: string; bytes: Buffer };
const types: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8", wasm: "application/wasm",
  pck: "application/octet-stream", bin: "application/octet-stream", json: "application/json", css: "text/css; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon",
  ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav", woff: "font/woff", woff2: "font/woff2", txt: "text/plain; charset=utf-8"
};
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export function validateBuildPath(path: string): string {
  if (!path || path.length > 240 || path.includes("\\") || path.startsWith("/") || /[%:\x00-\x1f\x7f]/.test(path)) throw new BuildInputError("文件路径不安全。");
  const segments = path.split("/");
  if (segments.length > 8 || segments.some((segment) => !/^[A-Za-z0-9][A-Za-z0-9_. -]{0,119}$/.test(segment) || /[. ]$/.test(segment) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment))) throw new BuildInputError("文件路径不安全。请使用英文导出文件名。");
  return path;
}
function checkExtras(bytes: Buffer) {
  for (let cursor = 0; cursor < bytes.length;) {
    if (cursor + 4 > bytes.length) throw new BuildInputError("ZIP 扩展字段损坏。");
    const id = bytes.readUInt16LE(cursor), length = bytes.readUInt16LE(cursor + 2);
    if (id === 1) throw new BuildInputError("暂不支持 ZIP64。");
    cursor += 4 + length;
    if (cursor > bytes.length) throw new BuildInputError("ZIP 扩展字段损坏。");
  }
}
type Entry = { path: string; offset: number; compressed: number; size: number; crc: number; method: number; flags: number; name: Buffer; directory: boolean };

function hasUnsupportedWebFeatures(html: string) {
  // Godot's standard shell contains an inactive service-worker fallback even without PWA.
  // Check exported configuration and actual registration, rather than a word in boilerplate.
  if (/GODOT_THREADS_ENABLED\s*=\s*true|GODOT_EXTENSIONS_ENABLED\s*=\s*true|navigator\s*\.\s*serviceWorker\s*\.\s*register\s*\(/i.test(html)) return true;
  const declarations = [...html.matchAll(/\b(?:const|let|var)\s+GODOT_CONFIG\s*=/g)];
  const configurations = [...html.matchAll(/\b(?:const|let|var)\s+GODOT_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;/g)];
  if (declarations.length !== configurations.length) return true;
  for (const match of configurations) {
    if (match[1].length > 64 * 1024) return true;
    try {
      const config = JSON.parse(match[1]);
      if (config.serviceWorker || config.ensureCrossOriginIsolationHeaders || (config.gdextensionLibs !== undefined && (!Array.isArray(config.gdextensionLibs) || config.gdextensionLibs.length))) return true;
    } catch { return true; }
  }
  return false;
}

/** Reads bounded buffers only. No archive entry is ever extracted to the filesystem. */
export function readGodotArchive(archive: Buffer): BuildFile[] {
  if (archive.length < 22 || archive.length > BUILD_LIMITS.archiveBytes) throw new BuildInputError("请选择不超过 32MB 的 ZIP 导出包。");
  let end = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
    if (archive.readUInt32LE(i) === 0x06054b50 && i + 22 + archive.readUInt16LE(i + 20) === archive.length) { end = i; break; }
  }
  if (end < 0) throw new BuildInputError("无法读取 ZIP 目录。");
  const count = archive.readUInt16LE(end + 10), directorySize = archive.readUInt32LE(end + 12), directoryOffset = archive.readUInt32LE(end + 16);
  if (archive.readUInt16LE(end + 4) || archive.readUInt16LE(end + 6) || archive.readUInt16LE(end + 8) !== count || count === 65535 || directoryOffset === 0xffffffff || directorySize === 0xffffffff) throw new BuildInputError("不支持分卷 ZIP 或 ZIP64。");
  if (!count || count > BUILD_LIMITS.files || directoryOffset + directorySize !== end) throw new BuildInputError("ZIP 文件数量或目录不符合要求。");
  const entries: Entry[] = [], seen = new Set<string>();
  let cursor = directoryOffset, total = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) throw new BuildInputError("ZIP 目录损坏。");
    const flags = archive.readUInt16LE(cursor + 8), method = archive.readUInt16LE(cursor + 10);
    const nameLength = archive.readUInt16LE(cursor + 28), extraLength = archive.readUInt16LE(cursor + 30), commentLength = archive.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & ~0x080e || (method !== 0 && method !== 8) || (method === 0 && flags & 6) || archive.readUInt16LE(cursor + 34) || archive.readUInt16LE(cursor + 6) > 20) throw new BuildInputError("ZIP 压缩方式、加密或目录不受支持。");
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    let path: string;
    try { path = new TextDecoder("utf-8", { fatal: true }).decode(name); } catch { throw new BuildInputError("ZIP 文件名编码不受支持。"); }
    const directory = path.endsWith("/");
    validateBuildPath(directory ? path.slice(0, -1) : path);
    const unixType = (archive.readUInt32LE(cursor + 38) >>> 16) & 0xf000;
    if (unixType && unixType !== (directory ? 0x4000 : 0x8000)) throw new BuildInputError("导出包不允许符号链接或特殊文件。");
    if (seen.has(path.toLowerCase())) throw new BuildInputError("导出包包含重复文件名。");
    seen.add(path.toLowerCase());
    checkExtras(archive.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    const compressed = archive.readUInt32LE(cursor + 20), size = archive.readUInt32LE(cursor + 24);
    total += size;
    if (size > BUILD_LIMITS.fileBytes || total > BUILD_LIMITS.totalBytes || (size > 1024 * 1024 && size > Math.max(1, compressed) * 100) || (directory && size !== 0)) throw new BuildInputError("导出包展开后过大，或压缩比例异常。");
    entries.push({ path, name, directory, compressed, size, flags, method, crc: archive.readUInt32LE(cursor + 16), offset: archive.readUInt32LE(cursor + 42) });
    cursor = next;
  }
  if (cursor !== end) throw new BuildInputError("ZIP 目录长度不一致。");
  const files: Array<{ path: string; bytes: Buffer }> = [], ranges: Array<[number, number]> = [];
  for (const entry of entries) {
    const start = entry.offset;
    if (start + 30 > directoryOffset || archive.readUInt32LE(start) !== 0x04034b50) throw new BuildInputError("ZIP 本地文件头损坏。");
    const nameLength = archive.readUInt16LE(start + 26), extraLength = archive.readUInt16LE(start + 28), dataStart = start + 30 + nameLength + extraLength, dataEnd = dataStart + entry.compressed;
    if (dataEnd > directoryOffset || archive.readUInt16LE(start + 6) !== entry.flags || archive.readUInt16LE(start + 8) !== entry.method || !archive.subarray(start + 30, start + 30 + nameLength).equals(entry.name)) throw new BuildInputError("ZIP 文件头与目录不一致。");
    checkExtras(archive.subarray(start + 30 + nameLength, dataStart));
    let rangeEnd = dataEnd;
    if (entry.flags & 8) {
      let descriptor = dataEnd;
      if (descriptor + 4 <= directoryOffset && archive.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
      if (descriptor + 12 > directoryOffset || archive.readUInt32LE(descriptor) !== entry.crc || archive.readUInt32LE(descriptor + 4) !== entry.compressed || archive.readUInt32LE(descriptor + 8) !== entry.size) throw new BuildInputError("ZIP 数据描述符损坏。");
      rangeEnd = descriptor + 12;
    } else if (archive.readUInt32LE(start + 14) !== entry.crc || archive.readUInt32LE(start + 18) !== entry.compressed || archive.readUInt32LE(start + 22) !== entry.size) throw new BuildInputError("ZIP 文件尺寸不一致。");
    if (ranges.some(([a, b]) => start < b && rangeEnd > a)) throw new BuildInputError("ZIP 文件区间重叠。");
    ranges.push([start, rangeEnd]);
    let bytes: Buffer;
    try { bytes = entry.method === 8 ? inflateRawSync(archive.subarray(dataStart, dataEnd), { maxOutputLength: Math.max(1, entry.size + 1) }) : Buffer.from(archive.subarray(dataStart, dataEnd)); }
    catch { throw new BuildInputError("ZIP 数据损坏或展开后超过限制。"); }
    if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new BuildInputError("ZIP 文件校验失败。");
    if (!entry.directory) files.push({ path: entry.path, bytes });
  }
  if (!files.some((file) => file.path === "index.html")) {
    const roots = new Set(files.map((file) => file.path.split("/")[0]));
    if (roots.size !== 1 || !files.some((file) => file.path === `${[...roots][0]}/index.html`)) throw new BuildInputError("请将以 index.html 导出的完整文件夹打包为 ZIP。");
    const prefix = `${[...roots][0]}/`;
    for (const file of files) file.path = file.path.slice(prefix.length);
  }
  for (const required of ["index.html", "index.js", "index.wasm", "index.pck"]) if (!files.some((file) => file.path === required)) throw new BuildInputError(`导出包缺少 ${required}。请在 Godot 中以 index.html 完整导出。`);
  const html = files.find((file) => file.path === "index.html")!.bytes.toString("utf8");
  if (!/<html[\s>]/i.test(html) || !/<head(\s[^>]*)?>/i.test(html) || !/<\/html>/i.test(html) || hasUnsupportedWebFeatures(html)) throw new BuildInputError("请选择未启用线程、扩展和 PWA 的完整 Godot Web 导出。");
  const wasm = files.find((file) => file.path === "index.wasm")!.bytes;
  if (wasm.length < 8 || !wasm.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) throw new BuildInputError("index.wasm 不是有效的 WebAssembly 模块。");
  return files.map(({ path, bytes }) => {
    validateBuildPath(path);
    const extension = path.split(".").pop()!.toLowerCase(), contentType = types[extension];
    if (!contentType || (extension === "html" && path !== "index.html") || /(?:worker|service)[.-].*\.js$|\.worker\.js$/i.test(path)) throw new BuildInputError("导出包包含不支持的文件，请关闭线程、扩展和 PWA。");
    return { path, bytes, contentType, sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
}
