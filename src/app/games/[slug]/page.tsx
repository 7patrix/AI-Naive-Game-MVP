import Link from "next/link";
import { notFound } from "next/navigation";
import { GameEventType, GameStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type GameDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const game = await db.game.findUnique({
    where: { slug },
    include: {
      author: {
        select: {
          name: true,
          email: true
        }
      },
      likes: {
        where: { userId: user?.id ?? "__anonymous__" },
        select: { id: true }
      },
      favorites: {
        where: { userId: user?.id ?? "__anonymous__" },
        select: { id: true }
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 5
      },
      _count: {
        select: {
          likes: true,
          favorites: true,
          events: true
        }
      }
    }
  });

  if (!game || game.status !== GameStatus.PUBLISHED) {
    notFound();
  }

  const eventCounts = await db.gameEvent.groupBy({
    by: ["type"],
    where: { gameId: game.id },
    _count: { type: true }
  });
  const countByType = new Map(eventCounts.map((item) => [item.type, item._count.type]));
  const likedByMe = user ? game.likes.length > 0 : false;
  const favoritedByMe = user ? game.favorites.length > 0 : false;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div
          className="h-72 bg-cover bg-center"
          style={{
            backgroundImage: game.coverUrl
              ? `url(${game.coverUrl})`
              : "linear-gradient(135deg, #c7d2fe, #e0f2fe, #fae8ff)"
          }}
        />
        <div className="p-8">
          <div className="flex flex-wrap gap-2">
            {game.tags.map((tag) => (
              <span
                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950">{game.title}</h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">{game.description}</p>
        </div>
      </section>

      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">游戏信息</h2>
        <dl className="mt-5 space-y-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">作者</dt>
            <dd className="font-medium text-slate-900">{game.author.name ?? game.author.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">发布时间</dt>
            <dd className="font-medium text-slate-900">
              {game.publishedAt?.toLocaleDateString("zh-CN") ?? "草稿"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">游玩次数</dt>
            <dd className="font-medium text-slate-900">{game.playCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">点赞</dt>
            <dd className="font-medium text-slate-900">{game._count.likes}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">收藏</dt>
            <dd className="font-medium text-slate-900">{game._count.favorites}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">埋点事件</dt>
            <dd className="font-medium text-slate-900">{game._count.events}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Manifest</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-700">
              {game.manifestUrl ?? "暂未生成"}
            </dd>
          </div>
        </dl>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <form action={`/api/games/${game.id}/like`} method="post">
            <button
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              type="submit"
            >
              {likedByMe ? "取消点赞" : "点赞"}
            </button>
          </form>
          <form action={`/api/games/${game.id}/favorite`} method="post">
            <button
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              type="submit"
            >
              {favoritedByMe ? "取消收藏" : "收藏"}
            </button>
          </form>
        </div>
        <Link
          className="mt-6 inline-flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
          href={`/play/${game.id}`}
        >
          开始游玩
        </Link>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">游玩埋点统计</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-white p-3">
              <p className="font-semibold text-slate-950">
                {countByType.get(GameEventType.PLAY_START) ?? 0}
              </p>
              <p className="mt-1 text-slate-500">开始</p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="font-semibold text-slate-950">
                {countByType.get(GameEventType.PLAY_LOADED) ?? 0}
              </p>
              <p className="mt-1 text-slate-500">加载成功</p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="font-semibold text-slate-950">
                {countByType.get(GameEventType.PLAY_ERROR) ?? 0}
              </p>
              <p className="mt-1 text-slate-500">加载失败</p>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">最近游玩事件</h3>
          {game.events.length > 0 ? (
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {game.events.map((event) => (
                <li className="flex justify-between gap-3" key={event.id}>
                  <span>{event.type}</span>
                  <span>{event.createdAt.toLocaleString("zh-CN")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">暂无埋点事件。</p>
          )}
        </div>
      </aside>
    </div>
  );
}
