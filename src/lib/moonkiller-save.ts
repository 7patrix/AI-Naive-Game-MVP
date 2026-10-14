/** First-party storage broker for the bundled MoonKiller game only. The opaque game
 * receives a capability for one fixed save slot; it never receives site storage,
 * credentials, arbitrary keys or another game's data. */
export function installMoonKillerSaveHost(getFrame: () => HTMLIFrameElement | null, version: string) {
  let port: MessagePort | undefined, generation = 0, chain = Promise.resolve();
  const validate = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const v = value as Record<string, any>;
    if (v.format !== "mothwake-state" || v.schema !== 1 || !["day", "ready", "night", "ending"].includes(v.phase)) return false;
    if (![0, 2].includes(v.oil) || !["", "west", "clock"].includes(v.choice)) return false;
    if (["day", "ready"].includes(v.phase) ? v.oil !== 2 || v.choice !== "" : v.oil !== 0 || v.choice === "") return false;
    if (!Number.isSafeInteger(v.revision) || v.revision < 0 || v.revision > 2147483647) return false;
    const flags = ["met_inn", "met_apothecary", "met_clock", "medicine_taken", "medicine_held", "medicine_delivered", "cord_taken", "cord_held", "clock_repaired"];
    if (!v.flags || typeof v.flags !== "object" || Array.isArray(v.flags) || Object.entries(v.flags).some(([key, value]) => !flags.includes(key) || typeof value !== "boolean")) return false;
    if (v.flags.medicine_held && (!v.flags.medicine_taken || v.flags.medicine_delivered) || v.flags.cord_held && (!v.flags.cord_taken || v.flags.clock_repaired)) return false;
    if (!v.location || !["street", "inn", "apothecary"].includes(v.location.zone) || !["arrival", "door"].includes(v.location.spawn)) return false;
    if (!v.preferences || !["zh", "en"].includes(v.preferences.language) || !Number.isFinite(v.preferences.volume) || v.preferences.volume < 0 || v.preferences.volume > .35 || typeof v.preferences.reduced_motion !== "boolean") return false;
    const q = v.q_third_knock;
    if (q !== undefined) {
      if (!q || typeof q !== "object" || Array.isArray(q) || !["available", "active", "ready_to_report", "completed"].includes(q.status) || !["none", "quiet", "message"].includes(q.solution)) return false;
      if (["inspected", "repair_hint_seen", "neighbor_reply_received", "revisit_eligible", "revisit_seen"].some(key => typeof q[key] !== "boolean")) return false;
      if (["available", "active"].includes(q.status) !== (q.solution === "none")) return false;
      if (q.solution === "quiet" && !q.inspected || q.solution === "message" && !q.neighbor_reply_received) return false;
      if ((q.revisit_eligible || q.revisit_seen) && q.status !== "completed" || q.revisit_seen && !q.revisit_eligible) return false;
      if (Object.keys(q).some(key => !["status", "inspected", "repair_hint_seen", "neighbor_reply_received", "solution", "revisit_eligible", "revisit_seen"].includes(key))) return false;
    }
    return !Object.keys(v).some(key => !["format", "schema", "content", "revision", "phase", "oil", "choice", "flags", "q_third_knock", "location", "preferences"].includes(key));
  };
  const database = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("duckmole-moonkiller-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saves");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("storage_unavailable"));
    request.onblocked = () => reject(new Error("storage_unavailable"));
  });
  const transact = async (op: "load" | "save", value?: unknown) => {
    const db = await database();
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const tx = db.transaction("saves", op === "save" ? "readwrite" : "readonly"), store = tx.objectStore("saves");
        let result: Record<string, unknown> = {};
        const current = store.get("first-night");
        current.onsuccess = () => {
          const existing = current.result;
          if (op === "save") {
            if (existing && validate(existing)) store.put(existing, "previous");
            store.put(value, "first-night");
            result = { revision: (value as Record<string, unknown>).revision };
          } else if (existing === undefined || validate(existing)) {
            result = { value: existing ?? null };
          } else {
            const previous = store.get("previous");
            previous.onsuccess = () => {
              if (!validate(previous.result)) { tx.abort(); return; }
              result = { value: previous.result, recovered: true };
            };
          }
        };
        tx.oncomplete = () => resolve(result); // Only transaction completion acknowledges a save.
        tx.onabort = tx.onerror = () => reject(new Error("storage_failed"));
      });
    } finally { db.close(); }
  };
  const receive = (event: MessageEvent) => {
    const frame = getFrame();
    if (event.origin !== "null" || !frame?.contentWindow || event.source !== frame.contentWindow || event.data?.type !== "MOONKILLER_SAVE_HELLO" || event.data.protocol !== 1 || event.data.version !== version) return;
    port?.close();
    const epoch = ++generation, channel = new MessageChannel();
    port = channel.port1;
    const nonce = crypto.randomUUID();
    let count = 0, period = Date.now();
    channel.port1.onmessage = event => {
      const request = event.data;
      if (epoch !== generation || request?.nonce !== nonce || !Number.isSafeInteger(request.id) || !["load", "save"].includes(request.op)) return;
      const respond = (data: Record<string, unknown>) => { if (epoch === generation) channel.port1.postMessage({ id: request.id, op: request.op, ...data }); };
      if (Date.now() - period > 1000) { period = Date.now(); count = 0; }
      if (++count > 12) { respond({ ok: false }); return; }
      let value: unknown;
      if (request.op === "save") {
        if (typeof request.json !== "string" || new TextEncoder().encode(request.json).length > 65536) { respond({ ok: false }); return; }
        try { value = JSON.parse(request.json); } catch { respond({ ok: false }); return; }
        if (!validate(value)) { respond({ ok: false }); return; }
      }
      chain = chain.then(async () => {
        if (epoch !== generation) return;
        try { respond({ ok: true, ...await transact(request.op, value) }); } catch { respond({ ok: false }); }
      });
    };
    channel.port1.start();
    // Opaque target origins cannot be named. The target is the verified frame window;
    // a transferred port is private to it and bound to this generation and nonce.
    frame.contentWindow.postMessage({ type: "MOONKILLER_SAVE_PORT", protocol: 1, version, nonce }, "*", [channel.port2]);
  };
  window.addEventListener("message", receive);
  return () => { ++generation; port?.close(); window.removeEventListener("message", receive); };
}

export function addMoonKillerSaveBridge(html: string, appOrigin: string, version: string) {
  const script = `<script>(()=>{
const origin=${JSON.stringify(new URL(appOrigin).origin)},version=${JSON.stringify(version)};
let port,nonce='',sequence=0;const pending=new Map();
window.moonkillerSave=(op,json,callback)=>{const id=++sequence;pending.set(id,{op,json,callback});if(port)port.postMessage({id,op,json,nonce});};
addEventListener('message',event=>{if(event.source!==parent||event.origin!==origin||event.data?.type!=='MOONKILLER_SAVE_PORT'||event.data.protocol!==1||event.data.version!==version||!event.ports[0]||typeof event.data.nonce!=='string')return;
port?.close();port=event.ports[0];nonce=event.data.nonce;
port.onmessage=event=>{const request=pending.get(event.data?.id);if(!request||event.data.op!==request.op)return;pending.delete(event.data.id);const response={...event.data};if(request.op==='save'){try{response.revision=JSON.parse(request.json).revision;}catch{response.revision=-1;}}request.callback(JSON.stringify(response));};port.start();
for(const [id,request] of pending)port.postMessage({id,op:request.op,json:request.json,nonce});});
parent.postMessage({type:'MOONKILLER_SAVE_HELLO',protocol:1,version},origin);
})();</script>`;
  return html.replace(/<head(\s[^>]*)?>/i, tag => tag + script);
}
