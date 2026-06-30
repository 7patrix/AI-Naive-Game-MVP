import Link from "next/link";
import { notFound } from "next/navigation";
import { GameEventType, GameStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { remoteGameManifestSchema, type RemoteGameManifest } from "@/lib/game-manifest";
import { PlayFrame } from "@/components/PlayFrame";

type PlayPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

function formatDevice(device: string) {
  if (device === "desktop") return "电脑";
  if (device === "mobile") return "手机";
  return device;
}

function formatInputMethod(method: string) {
  if (method === "keyboard") return "键盘";
  if (method === "pointer") return "鼠标/点击";
  if (method === "touch") return "触控";
  return method;
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  const game = await db.game.findUnique({
    where: { id }
  });

  if (!game || game.status !== GameStatus.PUBLISHED) {
    notFound();
  }

  let manifest: RemoteGameManifest | null = null;
  let manifestError: string | null = null;

  if (!game.manifestUrl) {
    manifestError = "该游戏还在准备中，暂时无法运行。";
  } else {
    try {
      const response = await fetch(game.manifestUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("游戏资源加载失败，请稍后重试。");
      }
      const parsed = remoteGameManifestSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("游戏资源暂时不可用，请稍后重试。");
      }
      manifest = parsed.data;
    } catch (error) {
      manifestError = error instanceof Error ? error.message : "游戏加载失败。";
    }
  }

  await db.$transaction([
    db.game.update({
      where: { id: game.id },
      data: {
        playCount: {
          increment: 1
        }
      }
    }),
    db.gameEvent.create({
      data: {
        gameId: game.id,
        userId: user?.id,
        type: GameEventType.PLAY_START,
        metadata: {
          manifestUrl: game.manifestUrl,
          manifestLoaded: Boolean(manifest),
          manifestError
        }
      }
    })
  ]);
  const runtimeEntryUrl = `/api/games/${game.id}/bundle`;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              开始游玩
            </p>
            <h1 className="mt-3 text-3xl font-bold text-slate-950">{game.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              准备好后点击开始，游戏会在当前页面中运行。使用键盘、鼠标或触控完成挑战，刷新后也可以重新开始。
            </p>
          </div>
          <Link
            className="inline-flex rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
            href={`/games/${game.slug}`}
          >
            返回详情
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-700">游戏状态</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-600">
              {manifest ? "已准备好" : "正在准备"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-700">操作方式</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-600">
              {manifest ? manifest.inputMethods.map(formatInputMethod).join(" / ") : "按游戏内提示操作"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
            <p className="text-sm font-medium text-slate-700">设备支持</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-600">
              {manifest
                ? `${manifest.supportedDevices.map(formatDevice).join(" / ")}，方向：${
                    manifest.orientation === "portrait"
                      ? "竖屏"
                      : manifest.orientation === "landscape"
                        ? "横屏"
                        : "不限"
                  }`
                : "读取游戏信息中"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
            <p className="text-sm font-medium text-slate-700">输入协议</p>
            <p className="mt-2 text-xs text-slate-600">
              {manifest ? `AI Arcade Input v${manifest.inputSchemaVersion}` : "读取游戏信息中"}
            </p>
            {manifest?.controlHints ? (
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                {manifest.controlHints.movement ? <li>移动：{manifest.controlHints.movement}</li> : null}
                {manifest.controlHints.primaryAction ? <li>主动作：{manifest.controlHints.primaryAction}</li> : null}
                {manifest.controlHints.restartAction ? <li>重开：{manifest.controlHints.restartAction}</li> : null}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      {manifest ? (
        <PlayFrame
          entryUrl={runtimeEntryUrl}
          gameId={game.id}
          manifestUrl={game.manifestUrl}
          permissions={manifest.permissions}
          title={manifest.title}
        />
      ) : (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-8 text-red-700">
          <h2 className="text-lg font-semibold">游戏加载失败</h2>
          <p className="mt-2 text-sm">{manifestError}</p>
        </section>
      )}
    </div>
  );
}
