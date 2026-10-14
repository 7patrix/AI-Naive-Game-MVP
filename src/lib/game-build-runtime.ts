import { BuildInputError } from "./game-build-archive";
import { gameRuntimeOrigin, runtimeOrigin } from "./game-build-security";

/** This host gate is also applied to every runtime handler; Proxy is not the authorization boundary. */
export function runtimeHostAccess(requestUrl: string, appUrl: string, runtimeUrl: string | undefined, production: boolean) {
  const request = new URL(requestUrl), appOrigin = new URL(appUrl).origin;
  let isolated: string;
  try { isolated = runtimeOrigin(appUrl, runtimeUrl, production); } catch { return request.pathname.startsWith("/runtime/") ? "deny" : "app"; }
  const gameId = request.hostname.split(".")[0].replace(/^g-/, "");
  let gameOrigin: string | undefined;
  try { gameOrigin = gameRuntimeOrigin(isolated, gameId); } catch {}
  if (request.origin === gameOrigin) return request.pathname === "/runtime/bootstrap" || request.pathname.startsWith("/runtime/builds/") ? "runtime" : "deny";
  if (request.pathname.startsWith("/runtime/")) return "deny";
  return request.origin === appOrigin ? "app" : "deny";
}
export function requireRuntimeHost(requestUrl: string, appUrl: string, runtimeUrl: string | undefined, production: boolean) {
  if (runtimeHostAccess(requestUrl, appUrl, runtimeUrl, production) !== "runtime") throw new BuildInputError("Runtime unavailable.");
}
export function requireGameRuntimeHost(requestUrl: string, appUrl: string, runtimeUrl: string | undefined, production: boolean, gameId: string) {
  requireRuntimeHost(requestUrl, appUrl, runtimeUrl, production);
  if (new URL(requestUrl).origin !== gameRuntimeOrigin(runtimeOrigin(appUrl, runtimeUrl, production), gameId)) throw new BuildInputError("Runtime unavailable.");
}
/** Runs before the exported engine script. It reports actual startGame completion, not iframe load. */
export function addGodotBridge(html: string, appUrl: string, versionId: string) {
  const origin = JSON.stringify(new URL(appUrl).origin), version = JSON.stringify(versionId);
  const bridge = `<script>
(()=>{const send=(event,data={})=>parent.postMessage({type:'DUCKMOLE_RUNTIME',versionId:${version},event,...data},${origin});
const wrap=engine=>{if(!engine||typeof engine.startGame!=='function'||engine.startGame.__duckmoleWrapped)return engine;const start=engine.startGame;
const wrapped=function(config={}){const progress=config.onProgress;let result;try{result=start.call(this,{...config,onProgress:(current,total)=>{if(progress)progress(current,total);send('progress',{current,total});}});}catch(error){send('error');throw error;}return Promise.resolve(result).then(value=>{send('ready');return value;},error=>{send('error');throw error;});};wrapped.__duckmoleWrapped=true;engine.startGame=wrapped;return engine;};
window.__duckmoleWrapEngine=wrap;
const patch=()=>{if(typeof Engine!=='undefined')wrap(Engine.prototype);};
document.addEventListener('load',event=>{if(event.target instanceof HTMLScriptElement)patch();},true);
window.addEventListener('error',()=>send('error'));window.addEventListener('unhandledrejection',()=>send('error'));patch();})();
</script>`;
  if (!/<head[\s>]/i.test(html)) throw new BuildInputError("Godot 导出页缺少 head 元素。");
  // Recent Godot exports create a fresh private prototype per instance; the public
  // constructor prototype cannot observe startGame. Wrap standard shell instances too.
  const withInstances = html.replace(/(\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Engine\s*\([^;\r\n]*\)\s*;)/g, "$1window.__duckmoleWrapEngine($2);");
  return withInstances.replace(/<head(\s[^>]*)?>/i, (tag) => tag + bridge);
}
