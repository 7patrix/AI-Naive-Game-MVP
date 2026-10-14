"use client";
import { useEffect, useRef, useState } from "react";
import { MOONKILLER_ENTRY, MOONKILLER_VERSION, MOONKILLER_DOWNLOAD_MB } from "@/lib/moonkiller";
import { installMoonKillerSaveHost } from "@/lib/moonkiller-save";
export function MoonKillerPlayer() {
  const frame = useRef<HTMLIFrameElement>(null), stage = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0), [state, setState] = useState("idle"), [progress, setProgress] = useState(0);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  useEffect(() => installMoonKillerSaveHost(() => frame.current, MOONKILLER_VERSION), []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "null" || event.source !== frame.current?.contentWindow || event.data?.type !== "DUCKMOLE_RUNTIME" || event.data.versionId !== MOONKILLER_VERSION) return;
      if (event.data.event === "ready") { setState("ready"); frame.current?.focus(); }
      if (event.data.event === "error") setState("error");
      if (event.data.event === "progress" && Number.isFinite(event.data.current) && Number.isFinite(event.data.total) && event.data.total > 0) setProgress(Math.max(0, Math.min(100, Math.round(event.data.current / event.data.total * 100))));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if (state !== "loading") return;
    const timer = window.setTimeout(() => setState("error"), 180000);
    return () => window.clearTimeout(timer);
  }, [state, attempt]);
  function start() { setProgress(0); setState("loading"); setAttempt(value => value + 1); }
  async function fullScreen() {
    try { await stage.current?.requestFullscreen(); frame.current?.focus(); } catch { /* Fullscreen is optional; normal play remains available. */ }
  }
  const loading = state === "loading";
  return <section ref={stage} className="game-player moonkiller-player" aria-label="雾钟镇游戏播放器" aria-busy={loading || !interactive}>
    <div className="player-toolbar"><div className="player-identity"><span className={`player-indicator ${state === "ready" ? "is-ready" : loading || !interactive ? "is-loading" : ""}`} aria-hidden="true" /><div><p>雾钟镇 · 第一夜</p><p className="player-status" role="status" aria-live="polite">{state === "ready" ? "游戏已启动" : loading ? `正在加载 ${progress}%` : state === "error" ? "加载未完成" : "准备进入小镇"}</p></div></div><div className="player-controls"><button type="button" className="button player-primary" onClick={start} disabled={loading || !interactive}>{!interactive ? "准备中…" : attempt ? "重新加载" : "开始游戏"}<span aria-hidden="true">↗</span></button>{state === "ready" ? <button type="button" className="button player-secondary" onClick={fullScreen}>全屏游玩</button> : null}</div></div>
    {state === "error" ? <p className="player-error" role="alert">游戏加载未完成，请检查网络后重新加载。首次下载约 {MOONKILLER_DOWNLOAD_MB}MB，较慢的网络可能需要更久。</p> : null}
    {attempt ? <iframe key={attempt} ref={frame} src={MOONKILLER_ENTRY} title="雾钟镇第一夜 · Godot 游戏" className="player-frame" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" /> : <div className="player-empty moonkiller-empty"><div className="player-stage-mark" aria-hidden="true"><span /><span /><span /><span /></div><p className="player-empty-title">黄昏未尽。还有三封信没有送到。</p><p>点击开始，走进雾钟镇的第一夜。</p><span className="player-stage-label">MOONKILLER / FIRST NIGHT</span></div>}
    <div className="player-footer"><p>WASD / 方向键移动 · E 互动 · Shift 加快 · Esc 暂停</p><p>推荐电脑键盘游玩 · 进度保存在本机 · 刷新恢复至安全落脚点</p></div>
  </section>;
}
