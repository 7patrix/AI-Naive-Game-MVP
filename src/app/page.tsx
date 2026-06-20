import Link from "next/link";
import { GameStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type HomePageProps = {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    sort?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const tag = params.tag?.trim() ?? "";
  const sort = params.sort ?? "latest";
  const where: Prisma.GameWhereInput = {
    status: GameStatus.PUBLISHED,
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { tags: { has: query } },
            { author: { name: { contains: query, mode: "insensitive" } } },
            { author: { email: { contains: query, mode: "insensitive" } } }
          ]
        }
      : {}),
    ...(tag ? { tags: { has: tag } } : {})
  };

  const games = await db.game.findMany({
    where,
    include: {
      author: {
        select: {
          name: true,
          email: true
        }
      },
      _count: {
        select: {
          likes: true,
          favorites: true
        }
      }
    },
    orderBy: {
      publishedAt: "desc"
    }
  });
  const publishedGames = await db.game.findMany({
    where: { status: GameStatus.PUBLISHED },
    select: { tags: true }
  });
  const allTags = Array.from(new Set(publishedGames.flatMap((game) => game.tags))).sort();
  const sortedGames = [...games].sort((left, right) => {
    if (sort === "plays") return right.playCount - left.playCount;
    if (sort === "likes") return right._count.likes - left._count.likes;
    return (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0);
  });

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 p-10 text-white shadow-2xl shadow-indigo-200/60">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-200">
              AI Native 互动游戏平台
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">
              输入创意，生成、发布并游玩 AI 小游戏。
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              这个 MVP 打通登录注册、AI Agent 生成、MinIO 对象存储、游戏发布和远端动态游玩的完整闭环。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-white/10 transition hover:-translate-y-0.5" href="/create">
                开始创建
              </Link>
              <a className="rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10" href="#games">
                浏览游戏
              </a>
            </div>
          </div>
          <div className="relative rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
            <p className="text-sm text-indigo-200">核心流程</p>
            <p className="mt-3 text-2xl font-semibold">
              登录 &rarr; 创建 &rarr; 发布 &rarr; 游玩
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-2xl font-bold">{publishedGames.length}</p>
                <p className="mt-1 text-slate-300">已发布</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-2xl font-bold">{allTags.length}</p>
                <p className="mt-1 text-slate-300">标签</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="games">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">已发布游戏</h2>
            <p className="mt-1 text-slate-600">
              这些游戏记录来自 PostgreSQL，包括系统预置的演示数据。
            </p>
          </div>
        </div>
        <form className="mb-6 grid gap-3 rounded-3xl border border-white/70 bg-white/90 p-4 shadow-xl shadow-slate-200/50 backdrop-blur md:grid-cols-[1fr_180px_180px_auto]">
          <input
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            defaultValue={query}
            name="q"
            placeholder="搜索标题、简介、作者或标签"
            type="search"
          />
          <select
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            defaultValue={tag}
            name="tag"
          >
            <option value="">全部标签</option>
            {allTags.map((tagOption) => (
              <option key={tagOption} value={tagOption}>
                {tagOption}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            defaultValue={sort}
            name="sort"
          >
            <option value="latest">最新发布</option>
            <option value="plays">最多游玩</option>
            <option value="likes">最多点赞</option>
          </select>
          <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
            筛选
          </button>
        </form>
        {sortedGames.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-3">
            {sortedGames.map((game) => (
              <article
                className="group overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl shadow-slate-200/60 transition duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-200/60"
                key={game.id}
              >
                <div
                  className="relative h-44 bg-cover bg-center transition duration-300 group-hover:scale-[1.02]"
                  style={{
                    backgroundImage: game.coverUrl
                      ? `url(${game.coverUrl})`
                      : "linear-gradient(135deg, #c7d2fe, #e0f2fe, #fae8ff)"
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">
                    {game.playCount} 次游玩
                  </div>
                </div>
                <div className="p-5">
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
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{game.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{game.description}</p>
                  <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                    <span>作者：{game.author.name ?? game.author.email}</span>
                    <span>{game._count.likes} 赞</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>发布时间：{game.publishedAt?.toLocaleDateString("zh-CN") ?? "未发布"}</span>
                    <span>
                      {game._count.likes} 赞 / {game._count.favorites} 收藏
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link
                      className="inline-flex justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
                      href={`/games/${game.slug}`}
                    >
                      详情
                    </Link>
                    <Link
                      className="inline-flex justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                      href={`/play/${game.id}`}
                    >
                      直接 Play
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-slate-600">
            暂时还没有已发布游戏。你可以先导入测试数据，或创建第一个游戏。
          </div>
        )}
      </section>
    </div>
  );
}
