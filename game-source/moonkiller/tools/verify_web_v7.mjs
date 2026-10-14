// Local exported-build verification; no packages, remote sites, or game code injection.
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('MoonKiller/evidence/dialog_v7');
const targets = await (await fetch('http://127.0.0.1:9227/json/list')).json();
const target = targets.find(t => t.type === 'page');
if (!target) throw new Error('No page in the dedicated QA browser');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen=resolve; ws.onerror=reject; });
let id=0;
const pending=new Map(), events=[];
ws.onmessage=({data})=>{
  const message=JSON.parse(data);
  if (message.id) {
    const p=pending.get(message.id);
    if (p) { pending.delete(message.id); message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result); }
  } else if (['Runtime.consoleAPICalled','Runtime.exceptionThrown','Log.entryAdded'].includes(message.method)) {
    const text=message.method==='Runtime.consoleAPICalled'
      ? message.params.args.map(a=>a.value??a.description??'').join(' ')
      : JSON.stringify(message.params);
    events.push({at:new Date().toISOString(),method:message.method,type:message.params.type??message.params.entry?.level,text});
    if (/QA_COMPLETE|FAIL |FIRST_NIGHT_CHOICE|FIRST_NIGHT_ENDING/.test(text)) console.log(text);
  }
};
function call(method,params={}) { return new Promise((resolve,reject)=>{ const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params})); }); }
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(pattern,from=0,timeout=180000) {
  const began=Date.now();let lastProgress=0;
  while (Date.now()-began<timeout) {
    const found=events.slice(from).find(e=>pattern.test(e.text));
    if (found) return found;
    if (Date.now()-lastProgress>15000) { console.log(`Waiting ${Math.round((Date.now()-began)/1000)}s: ${events.length-from} browser log entries`);lastProgress=Date.now(); }
    await delay(250);
  }
  throw new Error('Timed out waiting for '+pattern);
}
async function shot(name) {
  const r=await call('Page.captureScreenshot',{format:'png',fromSurface:true});
  await fs.writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));
}
async function key(type,key,code,vk,extra={}) {
  await call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,...extra});
}
async function press(keyName,code,vk) { await key('keyDown',keyName,code,vk);await delay(100);await key('keyUp',keyName,code,vk);await delay(350); }
await call('Runtime.enable');await call('Page.enable');await call('Log.enable');
if (process.argv.includes('--dialog-only')) {
  await call('Emulation.setDeviceMetricsOverride',{width:720,height:540,deviceScaleFactor:1,mobile:false});
  const start=events.length;
  let result;
  try {
    await call('Page.navigate',{url:'http://127.0.0.1:8765/qa_dialog.html'});
    result=await waitFor(/DIALOG_QA_COMPLETE checks=\d+ failures=\d+/,start);
    await delay(750);
    await shot('web_dialog_complete');
  } finally {
    await fs.writeFile(path.join(out,'web_dialog_final_logs.json'),JSON.stringify({method:'Isolated installed Chrome, CDP console capture, exported qa_dialog.html',viewport:[720,540],result:result??null,events:events.slice(start)},null,2));
  }
  if (!/failures=0/.test(result.text)) throw new Error(result.text);
  await call('Emulation.clearDeviceMetricsOverride');
  const restored=events.length;
  await call('Page.navigate',{url:'http://127.0.0.1:8765/index.html'});
  await waitFor(/MOTHWAKE_READY/,restored,60000);
  console.log('WEB_V7_DIALOG_COMPLETE_NORMAL_ENTRY_RESTORED');
  ws.close();
  process.exit(0);
}
await call('Emulation.setDeviceMetricsOverride',{width:960,height:600,deviceScaleFactor:1,mobile:false});
const storyStart=events.length;
await call('Page.navigate',{url:'http://127.0.0.1:8765/qa_first_night.html'});
let storyResult;
try {
  storyResult=await waitFor(/FIRST_NIGHT_QA_COMPLETE results=\d+ failures=\d+/,storyStart);
  await delay(750);
  await shot('web_full_story_complete');
} finally {
  await fs.writeFile(path.join(out,'web_full_story_logs.json'),JSON.stringify({method:'Isolated installed Chrome, CDP, exported qa_first_night.html',viewport:[960,600],result:storyResult??null,events:events.slice(storyStart)},null,2));
}
if (!/failures=0/.test(storyResult.text)) throw new Error(storyResult.text);

// Browser-delivered keys on the normal build, using ordinary walking to the board.
const normalStart=events.length;
await call('Page.navigate',{url:'http://127.0.0.1:8765/index.html'});
await waitFor(/MOTHWAKE_READY/,normalStart,60000);await delay(1500);
await call('Runtime.evaluate',{expression:"document.getElementById('canvas').focus()"});
await shot('web_normal_960x600');
await key('keyDown','a','KeyA',65);await delay(600);await key('keyUp','a','KeyA',65);
await key('keyDown','w','KeyW',87);await delay(1000);await key('keyUp','w','KeyW',87);await delay(500);
await shot('web_board_walk');
await key('keyDown','e','KeyE',69);await delay(700);
await key('keyDown','e','KeyE',69,{autoRepeat:true});await delay(350);
await shot('web_browser_held_e');
await key('keyUp','e','KeyE',69);await delay(200);
await press('e','KeyE',69);await shot('web_browser_fresh_e');
await press('e','KeyE',69);await press('Tab','Tab',9);await shot('web_browser_tab_focus');
await press('Enter','Enter',13);await shot('web_browser_enter_close');
await press('Escape','Escape',27);await shot('web_browser_pause');
await press('Escape','Escape',27);
await call('Emulation.setDeviceMetricsOverride',{width:720,height:540,deviceScaleFactor:1,mobile:false});await delay(500);
await press('e','KeyE',69);await shot('web_browser_narrow_focus');
await press('Escape','Escape',27);
await fs.writeFile(path.join(out,'web_browser_keyboard_trace.json'),JSON.stringify({method:'Browser CDP Input.dispatchKeyEvent on normal index.html; screenshots require visual verification',ordinaryWalking:{leftMs:600,upMs:1000},keys:['held E plus auto-repeat','released fresh E','Tab','Enter','Escape pause/resume'],viewports:[[960,600],[720,540]],events:events.slice(normalStart)},null,2));
await call('Emulation.clearDeviceMetricsOverride');
await call('Page.navigate',{url:'http://127.0.0.1:8765/index.html'});
await waitFor(/MOTHWAKE_READY/,events.length-1,60000);await delay(750);
await shot('web_normal_final');
console.log('WEB_V7_NORMAL_ENTRY_RESTORED');
ws.close();
