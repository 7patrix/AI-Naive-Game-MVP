import Link from "next/link";
import { notFound } from "next/navigation";
import { GameEventType, GameStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { remoteGameManifestSchema } from "@/lib/game-manifest";
import { PlayFrame } from "./PlayFrame";

type PlayPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: PlayPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  const game = await db.game.findUnique({
    where: { id }
  });

  if (!game || game.status !== GameStatus.PUBLISHED) {
    notFound();
  }

  let manifest:
    | {
        title: string;
        entryUrl: string;
        bundleUrl: string;
        permissions: string[];
        generatedAt: string;
      }
    | null = null;
  let manifestError: string | null = null;

  if (!game.manifestUrl) {
    manifestError = "该游戏还没有 Manifest 地址，暂时无法运行。";
  } else {
    try {
      const response = await fetch(game.manifestUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Manifest 请求失败：${response.status}`);
      }
      const parsed = remoteGameManifestSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("Manifest 结构不符合协议。");
      }
      manifest = parsed.data;
    } catch (error) {
      manifestError = error instanceof Error ? error.message : "Manifest 加载失败。";
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

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              远端游玩
            </p>
            <h1 className="mt-3 text-3xl font-bold text-slate-950">{game.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Play 页面会根据数据库中的 Manifest 地址，从对象存储读取远端游戏协议，并在
              iframe sandbox 中隔离运行生成的 HTML 游戏。
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
            <p className="text-sm font-medium text-slate-700">Manifest 地址</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-600">
              {game.manifestUrl ?? "暂未生成"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-700">iframe 入口</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-600">
              {manifest?.entryUrl ?? "等待 Manifest 加载成功"}
            </p>
          </div>
        </div>
      </section>

      {manifest ? (
        <PlayFrame
          entryUrl={manifest.entryUrl}
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
