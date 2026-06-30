import Link from "next/link";
import { GameStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserDisplayName, getUserProfileHref } from "@/lib/user-profile";

type HomePageProps = {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

function clampPage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function clampPageSize(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function buildPageHref(params: { q: string; tag: string; sort: string; pageSize: number }, page: number) {
  const nextParams = new URLSearchParams();
  if (params.q) nextParams.set("q", params.q);
  if (params.tag) nextParams.set("tag", params.tag);
  if (params.sort !== "latest") nextParams.set("sort", params.sort);
  if (params.pageSize !== DEFAULT_PAGE_SIZE) nextParams.set("pageSize", String(params.pageSize));
  if (page > 1) nextParams.set("page", String(page));
  return `/?${nextParams.toString()}`;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const tag = params.tag?.trim() ?? "";
  const sort = ["latest", "plays", "likes"].includes(params.sort ?? "") ? (params.sort as string) : "latest";
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const where: Prisma.GameWhereInput = {
    status: GameStatus.PUBLISHED,
    ...(query
      ? {
          OR: [
            { searchText: { contains: query.toLowerCase(), mode: "insensitive" } },
            { tags: { has: query } },
            { author: { name: { contains: query, mode: "insensitive" } } },
            { author: { email: { contains: query, mode: "insensitive" } } }
          ]
        }
      : {}),
    ...(tag ? { tags: { has: tag } } : {})
  };
  const orderBy: Prisma.GameOrderByWithRelationInput =
    sort === "plays"
      ? { playCount: "desc" }
      : sort === "likes"
        ? { likeCount: "desc" }
        : { publishedAt: "desc" };

  const [games, totalGames, publishedCount, tags] = await Promise.all([
    db.game.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        coverUrl: true,
        tags: true,
        playCount: true,
        likeCount: true,
        favoriteCount: true,
        publishedAt: true,
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: [orderBy, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    db.game.count({ where }),
    db.game.count({ where: { status: GameStatus.PUBLISHED } }),
    db.$queryRaw<{ tag: string }[]>`
      SELECT tag
      FROM "Game", unnest("tags") AS tag
      WHERE "status" = ${GameStatus.PUBLISHED}::"GameStatus"
      GROUP BY tag
      ORDER BY count(*) DESC, tag ASC
      LIMIT 50
    `
  ]);
  const allTags = tags.map((item) => item.tag);
  const totalPages = Math.max(1, Math.ceil(totalGames / pageSize));
  const previousHref = buildPageHref({ q: query, tag, sort, pageSize }, Math.max(1, page - 1));
  const nextHref = buildPageHref({ q: query, tag, sort, pageSize }, Math.min(totalPages, page + 1));

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
              把一个想法，变成可以立刻玩的小游戏。
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              描述你的玩法、上传灵感素材，几分钟内生成可分享的互动游戏。无需写代码，也能快速做出属于你的作品。
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
            <p className="text-sm text-indigo-200">创作方式</p>
            <p className="mt-3 text-2xl font-semibold">
              想象 &rarr; 生成 &rarr; 分享 &rarr; 游玩
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-2xl font-bold">{publishedCount}</p>
                <p className="mt-1 text-slate-300">可玩作品</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-2xl font-bold">{allTags.length}</p>
                <p className="mt-1 text-slate-300">灵感标签</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="games">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">发现好玩的作品</h2>
            <p className="mt-1 text-slate-600">
              浏览社区创作者生成的小游戏，按兴趣、热度或发布时间找到你的下一局。
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
        {games.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-3">
            {games.map((game) => (
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
                    <Link className="inline-flex items-center gap-2 font-semibold text-slate-600 hover:text-indigo-700" href={getUserProfileHref(game.author)}>
                      {game.author.avatarUrl ? (
                        <img
                          alt={getUserDisplayName(game.author)}
                          className="h-6 w-6 rounded-full object-cover"
                          src={game.author.avatarUrl}
                        />
                      ) : (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[10px] text-white">
                          {getUserDisplayName(game.author).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      {getUserDisplayName(game.author)}
                    </Link>
                    <span>{game.likeCount} 赞</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>发布时间：{game.publishedAt?.toLocaleDateString("zh-CN") ?? "未发布"}</span>
                    <span>
                      {game.likeCount} 赞 / {game.favoriteCount} 收藏
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
                      开始游戏
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-slate-600">
            暂时还没有可玩的作品。来创建第一个游戏吧。
          </div>
        )}
        {totalGames > 0 ? (
          <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-slate-600 shadow-sm md:flex-row">
            <span>
              第 {page} / {totalPages} 页，共 {totalGames} 个匹配游戏
            </span>
            <div className="flex gap-2">
              <Link
                aria-disabled={page <= 1}
                className={`rounded-xl border px-4 py-2 font-semibold ${
                  page <= 1
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                }`}
                href={previousHref}
              >
                上一页
              </Link>
              <Link
                aria-disabled={page >= totalPages}
                className={`rounded-xl border px-4 py-2 font-semibold ${
                  page >= totalPages
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                }`}
                href={nextHref}
              >
                下一页
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
