import Link from "next/link";
import { notFound } from "next/navigation";
import { GameEventType, GameStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type GameDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    reported?: string;
    reportError?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function GameDetailPage({ params, searchParams }: GameDetailPageProps) {
  const { slug } = await params;
  const query = await searchParams;
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
      parentGame: {
        select: {
          slug: true,
          title: true,
          currentVersionNumber: true
        }
      },
      remixes: {
        where: { status: GameStatus.PUBLISHED },
        orderBy: { publishedAt: "desc" },
        take: 4,
        select: {
          id: true,
          slug: true,
          title: true,
          publishedAt: true
        }
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        select: {
          id: true,
          versionNumber: true,
          manifestUrl: true,
          bundleUrl: true,
          changeSummary: true,
          createdAt: true
        }
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 5
      },
      _count: {
        select: {
          likes: true,
          favorites: true,
          events: true,
          reports: true
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
      {query.reported ? (
        <div className="lg:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          举报已提交，平台维护者会在管理后台处理。
        </div>
      ) : null}
      {query.reportError ? (
        <div className="lg:col-span-2 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          举报提交失败，请填写有效原因后重试。
        </div>
      ) : null}
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
            <dt className="text-slate-500">当前版本</dt>
            <dd className="font-medium text-slate-900">v{game.currentVersionNumber}</dd>
          </div>
          {game.parentGame ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Remix 来源</dt>
              <dd className="text-right font-medium text-slate-900">
                <Link className="text-indigo-600" href={`/games/${game.parentGame.slug}`}>
                  {game.parentGame.title} v{game.parentGame.currentVersionNumber}
                </Link>
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">点赞</dt>
            <dd className="font-medium text-slate-900">{game._count.likes}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">收藏</dt>
            <dd className="font-medium text-slate-900">{game._count.favorites}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">游玩记录</dt>
            <dd className="font-medium text-slate-900">{game._count.events}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">举报</dt>
            <dd className="font-medium text-slate-900">{game._count.reports}</dd>
          </div>
          <div>
            <dt className="text-slate-500">可玩状态</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">
              {game.manifestUrl ? "已准备好" : "准备中"}
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
        <Link
          className="mt-3 inline-flex w-full justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700"
          href={
            user
              ? `/create?remixGameId=${game.id}`
              : `/login?next=${encodeURIComponent(`/create?remixGameId=${game.id}`)}`
          }
        >
          Remix 派生这个游戏
        </Link>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">版本历史</h3>
          {game.versions.length > 0 ? (
            <ul className="mt-3 space-y-3 text-xs text-slate-600">
              {game.versions.map((version) => (
                <li className="rounded-xl bg-white p-3" key={version.id}>
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-slate-900">v{version.versionNumber}</span>
                    <span>{version.createdAt.toLocaleDateString("zh-CN")}</span>
                  </div>
                  <p className="mt-2">{version.changeSummary}</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                    {version.manifestUrl}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">暂无版本记录。</p>
          )}
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Remix 派生</h3>
          {game.remixes.length > 0 ? (
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {game.remixes.map((remix) => (
                <li className="flex justify-between gap-3" key={remix.id}>
                  <Link className="text-indigo-600" href={`/games/${remix.slug}`}>
                    {remix.title}
                  </Link>
                  <span>{remix.publishedAt?.toLocaleDateString("zh-CN") ?? "未发布"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">暂无公开 Remix。</p>
          )}
        </div>
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
          <h3 className="text-sm font-semibold text-slate-900">内容举报</h3>
          <form action={`/api/games/${game.id}/report`} className="mt-3 space-y-3" method="post">
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs" name="reason" required>
              <option value="">选择举报原因</option>
              <option value="不安全或违规内容">不安全或违规内容</option>
              <option value="无法正常游玩">无法正常游玩</option>
              <option value="侵权或不当素材">侵权或不当素材</option>
              <option value="垃圾内容或低质量">垃圾内容或低质量</option>
            </select>
            <textarea
              className="min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              name="details"
              placeholder="补充说明，可选"
            />
            <button className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700" type="submit">
              提交举报
            </button>
          </form>
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
