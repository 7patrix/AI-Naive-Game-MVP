"use client";
import { useEffect, useRef, useState } from "react";

type Props = { gameId: string; versionId: string; title: string; runtimeOrigin: string; preview?: boolean };
export function GameBuildPlayer({ gameId, versionId, title, runtimeOrigin, preview = false }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const attempt = useRef(0);
  const [frameKey, setFrameKey] = useState(0);
  const [entry, setEntry] = useState<string | null>(null), [state, setState] = useState("idle"), [progress, setProgress] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    attempt.current++; setEntry(null); setState("idle"); setProgress(null); setError(null);
  }, [versionId]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== runtimeOrigin || event.source !== frame.current?.contentWindow || event.data?.type !== "DUCKMOLE_RUNTIME" || event.data.versionId !== versionId) return;
      if (event.data.event === "ready") { setState("ready"); setError(null); }
      if (event.data.event === "error") { setState("error"); setError("游戏启动失败。请检查导出设置，或重新打开预览。"); }
      if (event.data.event === "progress" && Number.isFinite(event.data.current) && Number.isFinite(event.data.total) && event.data.total > 0) setProgress(`${Math.max(0, Math.min(100, Math.round(event.data.current / event.data.total * 100)))}%`);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [runtimeOrigin, versionId]);
  useEffect(() => {
    if (state !== "loading" && state !== "page") return;
    const timeout = window.setTimeout(() => { setState("error"); setError("等待游戏启动超时。可以重新加载；浏览器限制预览存储时，请在新窗口打开。"); }, 90000);
    return () => window.clearTimeout(timeout);
  }, [state]);
  async function start(standalone = false) {
    const popup = standalone ? window.open("about:blank", "_blank") : null;
    if (standalone && !popup) { setError("浏览器拦截了新窗口，请允许此网站打开新窗口后重试。"); return; }
    if (popup) popup.opener = null;
    const currentAttempt = ++attempt.current;
    setError(null); setProgress(null); setState("loading"); setEntry(null);
    try {
      let url = `${runtimeOrigin}/runtime/builds/${versionId}/index.html`;
      if (preview) {
        const response = await fetch(`/api/studio/games/${gameId}/versions/${versionId}/preview`, { method: "POST", signal: AbortSignal.timeout(20000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "无法打开预览。");
        url = data.entryUrl;
      }
      if (new URL(url).origin !== runtimeOrigin) throw new Error("游戏资源地址不正确。");
      if (currentAttempt !== attempt.current) { popup?.close(); return; }
      if (popup) { popup.location.replace(url); setState("idle"); } else { setFrameKey(currentAttempt); setEntry(url); }
    } catch (caught) { popup?.close(); if (currentAttempt !== attempt.current) return; setState("error"); setError(caught instanceof Error ? caught.message : "无法打开游戏。"); }
  }
  async function revoke() {
    try {
      const response = await fetch(`/api/studio/games/${gameId}/versions/${versionId}/preview`, { method: "DELETE" });
      if (!response.ok) throw new Error("撤销预览失败，请稍后重试。");
      attempt.current++; setEntry(null); setState("idle"); setProgress(null); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "撤销预览失败。"); }
  }

  const loading = state === "loading" || state === "page";
  const status = state === "ready" ? "游戏已启动" : state === "loading" ? `正在加载 ${progress ?? ""}` : state === "page" ? "正在等待游戏启动" : state === "error" ? "启动未完成" : preview ? "私密预览 · 仅作者可访问 · 20 分钟有效" : "准备开始";
  return <section className="game-player" aria-label={`${title}播放器`} aria-busy={loading}>
    <div className="player-toolbar"><div className="player-identity"><span className={`player-indicator ${state === "ready" ? "is-ready" : loading ? "is-loading" : ""}`} aria-hidden="true" /><div><p>{title}</p><p className="player-status" role="status" aria-live="polite">{status}</p></div></div><div className="player-controls"><button type="button" className="button player-primary" onClick={() => start()} disabled={state === "loading"}>{entry ? "重新加载" : preview ? "打开私密预览" : "开始游戏"}<span aria-hidden="true">{loading ? "…" : "↗"}</span></button><button type="button" className="button player-secondary" onClick={() => start(true)} disabled={state === "loading"}>在新窗口打开</button>{preview && entry ? <button type="button" className="button player-secondary" onClick={revoke}>撤销预览</button> : null}</div></div>
    {error ? <p className="player-error" role="alert">{error}</p> : null}
    {entry ? <iframe key={frameKey} ref={frame} src={entry} title={`${title}${preview ? "私密预览" : "游玩"}`} className="player-frame" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" onLoad={() => { setState(value => value === "ready" || value === "error" ? value : "page"); frame.current?.focus(); }} /> : <div className="player-empty"><div className="player-stage-mark" aria-hidden="true"><span /><span /><span /><span /></div><p className="player-empty-title">{loading ? "正在准备你的下一局" : state === "error" ? "再给这个世界一次机会" : preview ? "先试玩，再让世界看到。" : "一个小世界，等你进入。"}</p><p>{loading ? "资源加载完成后，游戏会在这里开始。" : preview ? "打开预览，检查玩法、输入和存档。" : "点击上方「开始游戏」加载。"}</p><span className="player-stage-label">DUCKMOLE / {preview ? "PRIVATE PREVIEW" : "PLAY"}</span></div>}
    <div className="player-footer"><p>存档保存在当前浏览器。加载失败时可重试或在新窗口打开。</p><p>手机操作由游戏提供 <span aria-hidden="true">·</span> <kbd>Esc</kbd> 退出全屏</p></div>
  </section>;
}
