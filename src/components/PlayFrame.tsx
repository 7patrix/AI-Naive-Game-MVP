"use client";

import { useEffect, useRef, useState } from "react";

type PlayFrameProps = {
  gameId: string;
  title: string;
  entryUrl: string;
  manifestUrl: string | null;
  permissions: string[];
  height?: number | string;
  compact?: boolean;
  reportTelemetry?: boolean;
};

type LoadState = "idle" | "loading" | "loaded" | "timeout" | "error";
const forwardedKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d", "W", "A", "S", "D", "r", "R"]);

async function reportPlayEvent(gameId: string, type: "PLAY_LOADED" | "PLAY_ERROR", metadata: object) {
  try {
    await fetch(`/api/games/${gameId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type, metadata })
    });
  } catch {
    // Telemetry should never break gameplay.
  }
}

function formatPermission(permission: string) {
  if (permission === "keyboard") return "键盘";
  if (permission === "pointer") return "鼠标/点击";
  if (permission === "touch") return "触控";
  return permission;
}

export function PlayFrame({
  gameId,
  title,
  entryUrl,
  manifestUrl,
  permissions,
  height = "min(78vh, 760px)",
  compact = false,
  reportTelemetry = true
}: PlayFrameProps) {
  const [state, setState] = useState<LoadState>("idle");
  const [runId, setRunId] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const startedAt = useRef<number>(0);
  const hasReported = useRef(false);
  const [measuredHeight, setMeasuredHeight] = useState<string | null>(null);
  const frameHeight = measuredHeight ?? (typeof height === "number" ? `${height}px` : height);

  useEffect(() => {
    if (state !== "loading") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setState((current) => {
        if (current !== "loading") return current;

        if (reportTelemetry) {
          void reportPlayEvent(gameId, "PLAY_ERROR", {
            manifestUrl,
            entryUrl,
            reason: "iframe_load_timeout",
            durationMs: Date.now() - startedAt.current
          });
        }

        return "timeout";
      });
    }, 12000);

    return () => window.clearTimeout(timeout);
  }, [entryUrl, gameId, manifestUrl, reportTelemetry, runId, state]);

  useEffect(() => {
    if (state !== "loaded") {
      return;
    }

    const handleResize = () => resizeFrameToContent();
    function forwardKey(event: KeyboardEvent, phase: "keydown" | "keyup") {
      if (!forwardedKeys.has(event.key)) {
        return;
      }

      event.preventDefault();
      frameRef.current?.contentWindow?.postMessage(
        {
          type: "AI_ARCADE_KEY",
          phase,
          key: event.key
        },
        "*"
      );
    }

    const handleKeyDown = (event: KeyboardEvent) => forwardKey(event, "keydown");
    const handleKeyUp = (event: KeyboardEvent) => forwardKey(event, "keyup");

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleResize);
    };
  }, [state, runId]);

  function startGame() {
    startedAt.current = Date.now();
    hasReported.current = false;
    setMeasuredHeight(null);
    setState("loading");
    setRunId((current) => current + 1);
    window.setTimeout(() => frameRef.current?.focus(), 0);
  }

  function sendVirtualKey(key: string, phase: "keydown" | "keyup") {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "AI_ARCADE_KEY",
        phase,
        key
      },
      "*"
    );
  }

  function resizeFrameToContent() {
    if (compact) {
      return;
    }

    try {
      const documentElement = frameRef.current?.contentDocument?.documentElement;
      const body = frameRef.current?.contentDocument?.body;
      const contentHeight = Math.max(
        documentElement?.scrollHeight ?? 0,
        body?.scrollHeight ?? 0,
        frameRef.current?.contentWindow?.innerHeight ?? 0
      );

      if (contentHeight > 0) {
        setMeasuredHeight(`${Math.ceil(contentHeight)}px`);
      }
    } catch {
      // Cross-origin access can fail for non-proxied bundles. Keep the configured height.
    }
  }

  function handleLoad() {
    const durationMs = Date.now() - startedAt.current;
    setState("loaded");
    frameRef.current?.focus();
    resizeFrameToContent();
    window.setTimeout(resizeFrameToContent, 100);
    window.setTimeout(resizeFrameToContent, 500);

    if (hasReported.current) {
      return;
    }

    hasReported.current = true;

    if (reportTelemetry) {
      void reportPlayEvent(gameId, "PLAY_LOADED", {
        manifestUrl,
        entryUrl,
        durationMs
      });
    }
  }

  function handleError() {
    setState("error");

    if (reportTelemetry) {
      void reportPlayEvent(gameId, "PLAY_ERROR", {
        manifestUrl,
        entryUrl,
        reason: "iframe_error",
        durationMs: Date.now() - startedAt.current
      });
    }
  }

  const showOverlay = state !== "loaded";
  const shouldRenderFrame = state !== "idle";
  const supportsTouch = permissions.includes("touch");

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-3 text-sm text-slate-200 md:flex-row md:items-center md:justify-between">
        <span>{title}</span>
        <div className="flex items-center gap-3">
          {!compact ? <span>操作：{permissions.map(formatPermission).join("、")}</span> : null}
          {state === "loaded" ? (
            <button
              className="rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
              onClick={startGame}
              type="button"
            >
              重新开始
            </button>
          ) : null}
        </div>
      </div>
      <div className="relative">
        {showOverlay ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/90 px-6 text-center text-slate-100">
            <div>
              {state === "loading" ? (
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
              ) : null}
              <h2 className="mt-5 text-lg font-semibold">
                {state === "idle"
                  ? compact
                    ? "预览已就绪"
                    : "准备开始游戏"
                  : state === "loading"
                    ? "正在加载游戏"
                    : "游戏加载较慢"}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                {state === "idle"
                  ? compact
                    ? "点击后在右侧预览当前作品。"
                    : "点击开始后再进入游戏，避免在你准备操作前自动开局。"
                  : state === "loading"
                    ? "游戏资源正在准备中，加载完成后会自动进入游戏。"
                    : "游戏还没有完成加载，可以重新开始，或稍后再试。"}
              </p>
              {state !== "loading" ? (
                <button
                  className="mt-5 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-400"
                  onClick={startGame}
                  type="button"
                >
                  {state === "idle" ? (compact ? "打开预览" : "开始游戏") : "重新加载游戏"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {shouldRenderFrame ? (
          <iframe
            className="w-full bg-slate-950"
            key={runId}
            loading="eager"
            onError={handleError}
            onLoad={handleLoad}
            ref={frameRef}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            scrolling="no"
            src={entryUrl}
            style={{ height: frameHeight }}
            tabIndex={0}
            title={title}
          />
        ) : (
          <div className="w-full bg-slate-950" style={{ height: frameHeight }} />
        )}
        {supportsTouch && !compact && state === "loaded" ? (
          <div className="absolute bottom-4 right-4 z-20 grid grid-cols-3 grid-rows-3 gap-2 select-none touch-none">
            <TouchButton className="col-start-2 row-start-1" label="↑" onKey={sendVirtualKey} value="ArrowUp" />
            <TouchButton className="col-start-1 row-start-2" label="←" onKey={sendVirtualKey} value="ArrowLeft" />
            <TouchButton className="col-start-2 row-start-2 text-xs" label="重开" onKey={sendVirtualKey} value="r" />
            <TouchButton className="col-start-3 row-start-2" label="→" onKey={sendVirtualKey} value="ArrowRight" />
            <TouchButton className="col-start-2 row-start-3" label="↓" onKey={sendVirtualKey} value="ArrowDown" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TouchButton({
  className,
  label,
  onKey,
  value
}: {
  className: string;
  label: string;
  onKey: (key: string, phase: "keydown" | "keyup") => void;
  value: string;
}) {
  return (
    <button
      className={`h-12 w-12 rounded-2xl border border-white/20 bg-indigo-500/80 text-base font-bold text-white shadow-lg shadow-slate-950/30 backdrop-blur transition active:bg-indigo-400 ${className}`}
      onPointerCancel={() => onKey(value, "keyup")}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onKey(value, "keydown");
      }}
      onPointerLeave={() => onKey(value, "keyup")}
      onPointerUp={(event) => {
        event.preventDefault();
        onKey(value, "keyup");
      }}
      type="button"
    >
      {label}
    </button>
  );
}
