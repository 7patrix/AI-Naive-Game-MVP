import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { installMoonKillerSaveHost, addMoonKillerSaveBridge } from "../src/lib/moonkiller-save";

function host() {
  let receive: (event: unknown) => void = () => {};
  const transfers: any[] = [], ports: any[] = [];
  let opens = 0, serial = 0;
  class Port {
    messages: any[] = []; closed = false; onmessage?: (event: unknown) => void;
    start() {} close() { this.closed = true; }
    postMessage(value: unknown) { this.messages.push(value); }
  }
  class Channel {
    port1 = new Port(); port2 = new Port();
    constructor() { ports.push(this.port1); }
  }
  const frame = { contentWindow: { postMessage: (...args: unknown[]) => transfers.push(args) } };
  const context = {
    frame, TextEncoder, Date, MessageChannel: Channel,
    crypto: { randomUUID: () => `nonce-${++serial}` },
    window: { addEventListener: (_: string, fn: any) => receive = fn, removeEventListener: () => receive = () => {} },
    indexedDB: { open: () => { opens++; const request: any = {}; queueMicrotask(() => request.onerror?.()); return request; } },
  };
  const cleanup = runInNewContext(`const __name=(f)=>f;(${installMoonKillerSaveHost.toString()})(()=>frame,'test-version')`, context);
  const hello = (override = {}) => receive({ origin: "null", source: frame.contentWindow, data: { type: "MOONKILLER_SAVE_HELLO", protocol: 1, version: "test-version" }, ...override });
  return { hello, transfers, ports, cleanup, opens: () => opens };
}

test("only the exact opaque game frame and pinned version receive the save capability", () => {
  const h = host();
  h.hello({ origin: "https://duckmole.site" });
  h.hello({ source: {} });
  h.hello({ data: { type: "MOONKILLER_SAVE_HELLO", protocol: 1, version: "other-game" } });
  assert.equal(h.transfers.length, 0);
  h.hello();
  assert.equal(h.transfers.length, 1);
  assert.equal(h.transfers[0][0].nonce, "nonce-1");
  h.cleanup();
  assert.equal(h.ports[0].closed, true);
});

test("wrong nonce, unsupported operations and invalid or oversized states never access storage", () => {
  const h = host(); h.hello(); const port = h.ports[0];
  const send = (data: any) => port.onmessage({ data: { nonce: "nonce-1", id: 1, ...data } });
  send({ nonce: "wrong", op: "load" });
  send({ op: "read-cookie" });
  assert.equal(port.messages.length, 0);
  send({ op: "save", json: "{bad" });
  send({ op: "save", json: "x".repeat(65537) });
  send({ op: "save", json: JSON.stringify({ arbitraryKey: "another-game" }) });
  assert.equal(port.messages.length, 3);
  assert.ok(port.messages.every((x: any) => x.ok === false));
  assert.equal(h.opens(), 0);
});

test("storage failures return failure rather than acknowledging saved progress", async () => {
  const h = host(); h.hello();
  h.ports[0].onmessage({ data: { nonce: "nonce-1", id: 2, op: "load" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.opens(), 1);
  assert.equal(h.ports[0].messages[0].ok, false);
});

test("reload revokes the previous port generation", async () => {
  const h = host(); h.hello(); const old = h.ports[0]; h.hello();
  old.onmessage({ data: { nonce: "nonce-1", id: 3, op: "load" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(old.closed, true);
  assert.equal(h.opens(), 0);
  assert.equal(old.messages.length, 0);
});

test("child bridge accepts only the parent origin and preserves failed write revision", () => {
  const html = addMoonKillerSaveBridge("<head></head>", "https://duckmole.site", "version");
  const source = html.match(/<script>([\s\S]+)<\/script>/)![1];
  let receive: any;
  const parent = { postMessage() {} }, window: any = {}, messages: any[] = [];
  runInNewContext(source, { parent, window, addEventListener: (_: string, fn: any) => receive = fn });
  let response: any;
  window.moonkillerSave("save", '{"revision":7}', (value: string) => response = JSON.parse(value));
  const port: any = { close() {}, start() {}, postMessage: (value: unknown) => messages.push(value) };
  receive({ source: parent, origin: "https://other.example", data: { type: "MOONKILLER_SAVE_PORT", protocol: 1, version: "version", nonce: "n" }, ports: [port] });
  assert.equal(messages.length, 0);
  receive({ source: parent, origin: "https://duckmole.site", data: { type: "MOONKILLER_SAVE_PORT", protocol: 1, version: "version", nonce: "n" }, ports: [port] });
  assert.equal(messages.length, 1);
  port.onmessage({ data: { id: 1, op: "save", ok: false } });
  assert.equal(response.ok, false); assert.equal(response.revision, 7);
});
