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
type ArcadeInputMessage =
  | {
      type: "AI_ARCADE_INPUT";
      kind: "move";
      x: number;
      y: number;
      active: boolean;
    }
  | {
      type: "AI_ARCADE_INPUT";
      kind: "action";
      name: "primary" | "restart";
      pressed: boolean;
    };
const forwardedKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d", "W", "A", "S", "D", "r", "R"]);

function keyToMove(key: string) {
  const normalized = key.toLowerCase();
  if (normalized === "arrowleft" || normalized === "a") return { x: -1, y: 0 };
  if (normalized === "arrowright" || normalized === "d") return { x: 1, y: 0 };
  if (normalized === "arrowup" || normalized === "w") return { x: 0, y: -1 };
  if (normalized === "arrowdown" || normalized === "s") return { x: 0, y: 1 };
  return null;
}

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
  const virtualMoveKeys = useRef<Set<string>>(new Set());
  const [measuredHeight, setMeasuredHeight] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
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
    if (state !== "loaded" || compact || !permissions.includes("touch")) {
      return;
    }

    const shouldOpen = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    setControlsOpen(shouldOpen);
  }, [compact, permissions, state, runId]);

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
      sendKeyCompat(event.key, phase);

      if (event.key.toLowerCase() === "r") {
        sendArcadeInput({
          type: "AI_ARCADE_INPUT",
          kind: "action",
          name: "restart",
          pressed: phase === "keydown"
        });
        return;
      }

      const move = keyToMove(event.key);
      if (move) {
        sendArcadeInput({
          type: "AI_ARCADE_INPUT",
          kind: "move",
          x: move.x,
          y: move.y,
          active: phase === "keydown"
        });
      }
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
    updateCompatMoveKeys(0, 0, false);
    setMeasuredHeight(null);
    setState("loading");
    setRunId((current) => current + 1);
    window.setTimeout(() => frameRef.current?.focus(), 0);
  }

  function sendKeyCompat(key: string, phase: "keydown" | "keyup") {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "AI_ARCADE_KEY",
        phase,
        key
      },
      "*"
    );
  }

  function sendArcadeInput(message: ArcadeInputMessage) {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }

  function sendMove(x: number, y: number, active: boolean) {
    updateCompatMoveKeys(x, y, active);
    sendArcadeInput({
      type: "AI_ARCADE_INPUT",
      kind: "move",
      x,
      y,
      active
    });
  }

  function updateCompatMoveKeys(x: number, y: number, active: boolean) {
    const nextKeys = new Set<string>();
    const threshold = 0.28;

    if (active) {
      if (x < -threshold) nextKeys.add("ArrowLeft");
      if (x > threshold) nextKeys.add("ArrowRight");
      if (y < -threshold) nextKeys.add("ArrowUp");
      if (y > threshold) nextKeys.add("ArrowDown");
    }

    for (const key of virtualMoveKeys.current) {
      if (!nextKeys.has(key)) {
        sendKeyCompat(key, "keyup");
      }
    }

    for (const key of nextKeys) {
      if (!virtualMoveKeys.current.has(key)) {
        sendKeyCompat(key, "keydown");
      }
    }

    virtualMoveKeys.current = nextKeys;
  }

  function sendAction(name: "primary" | "restart", pressed: boolean) {
    sendArcadeInput({
      type: "AI_ARCADE_INPUT",
      kind: "action",
      name,
      pressed
    });

    if (name === "restart") {
      sendKeyCompat("r", pressed ? "keydown" : "keyup");
    }
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
          <VirtualControls
            isOpen={controlsOpen}
            onAction={sendAction}
            onMove={sendMove}
            onToggle={() => {
              setControlsOpen((current) => {
                if (current) {
                  sendMove(0, 0, false);
                }
                return !current;
              });
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function VirtualControls({
  isOpen,
  onAction,
  onMove,
  onToggle
}: {
  isOpen: boolean;
  onAction: (name: "primary" | "restart", pressed: boolean) => void;
  onMove: (x: number, y: number, active: boolean) => void;
  onToggle: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-4 select-none">
      <div className="flex items-end justify-between">
        {isOpen ? <VirtualJoystick onMove={onMove} /> : <div />}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <button
            className="rounded-full border border-white/15 bg-slate-950/35 px-3 py-2 text-xs font-semibold text-white/80 shadow-lg backdrop-blur transition hover:bg-slate-950/55"
            onClick={onToggle}
            type="button"
          >
            {isOpen ? "收起控制" : "触控"}
          </button>
          {isOpen ? (
            <div className="flex flex-col items-end gap-2 opacity-55 transition hover:opacity-95 active:opacity-95">
              <ActionButton label="动作" onAction={onAction} value="primary" />
              <ActionButton label="重开" onAction={onAction} value="restart" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VirtualJoystick({ onMove }: { onMove: (x: number, y: number, active: boolean) => void }) {
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);

  function updateStick(clientX: number, clientY: number) {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;

    const radius = rect.width / 2;
    const rawX = clientX - (rect.left + radius);
    const rawY = clientY - (rect.top + radius);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > radius ? radius / distance : 1;
    const x = (rawX * scale) / radius;
    const y = (rawY * scale) / radius;

    setStick({ x, y });
    onMove(Number(x.toFixed(2)), Number(y.toFixed(2)), true);
  }

  function resetStick() {
    setStick({ x: 0, y: 0 });
    onMove(0, 0, false);
  }

  return (
    <div
      className="pointer-events-auto relative h-24 w-24 rounded-full border border-white/15 bg-slate-950/25 opacity-50 shadow-xl shadow-slate-950/30 backdrop-blur transition hover:opacity-90 active:opacity-95 touch-none"
      onPointerCancel={resetStick}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateStick(event.clientX, event.clientY);
      }}
      onPointerLeave={resetStick}
      onPointerMove={(event) => {
        if (event.buttons === 0) return;
        event.preventDefault();
        updateStick(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        resetStick();
      }}
      ref={baseRef}
    >
      <div
        className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-indigo-400/90 shadow-lg shadow-indigo-950/40"
        style={{
          transform: `translate(calc(-50% + ${stick.x * 30}px), calc(-50% + ${stick.y * 30}px))`
        }}
      />
      <span className="absolute inset-x-0 bottom-2 text-center text-[10px] font-semibold text-white/70">移动</span>
    </div>
  );
}

function ActionButton({
  label,
  onAction,
  value
}: {
  label: string;
  onAction: (name: "primary" | "restart", pressed: boolean) => void;
  value: "primary" | "restart";
}) {
  return (
    <button
      className="h-12 min-w-12 rounded-2xl border border-white/15 bg-indigo-500/65 px-3 text-xs font-bold text-white shadow-lg shadow-slate-950/25 backdrop-blur transition active:bg-indigo-400"
      onPointerCancel={() => onAction(value, false)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onAction(value, true);
      }}
      onPointerLeave={() => onAction(value, false)}
      onPointerUp={(event) => {
        event.preventDefault();
        onAction(value, false);
      }}
      type="button"
    >
      {label}
    </button>
  );
}
