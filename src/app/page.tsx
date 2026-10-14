import Link from "next/link";
import { GameCover } from "@/components/GameCover";
import { AuthorAvatar } from "@/components/AuthorAvatar";
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


  return <div className="page-enter">
    <header className="shelf-heading"><div><p className="eyebrow">Duckmole / 游戏架</p><h1 className="display-title">下一局，<span>从这里开始。</span></h1><p className="page-intro">一个个认真制作的小世界。找到喜欢的作品，打开就玩。</p></div><Link className="button button-quiet" href="/studio">带来你的作品 <span aria-hidden="true">↗</span></Link></header>
    <aside className="moonkiller-invitation"><div><p className="eyebrow">特别试玩 / Godot</p><h2>雾钟镇 · 第一夜</h2><p>三封未送出的信，两盏灯油。走进黄昏，决定这一夜的去向。</p></div><Link className="button" href="/play/moonkiller">走进小镇 <span aria-hidden="true">↗</span></Link></aside>
    <section id="games" aria-labelledby="games-heading">
      <div className="section-title"><h2 id="games-heading">探索作品 <span className="count-label">{publishedCount} 个公开作品</span></h2><span className="utility-label">{sort === "plays" ? "按游玩次数" : sort === "likes" ? "按点赞次数" : "按发布时间"}</span></div>
      <form className="shelf-filters" action="/" aria-label="筛选游戏"><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">搜索游戏</span><input type="search" name="q" defaultValue={query} placeholder="搜索作品、作者或标签" /></label><label><span className="sr-only">作品标签</span><select name="tag" defaultValue={tag}><option value="">全部标签</option>{allTags.map(t => <option key={t} value={t}>{t}</option>)}</select></label><label><span className="sr-only">排序方式</span><select name="sort" defaultValue={sort}><option value="latest">最新发布</option><option value="plays">最多游玩</option><option value="likes">最多点赞</option></select></label><input type="hidden" name="pageSize" value={pageSize} /><button className="button button-small" type="submit">筛选 <span aria-hidden="true">→</span></button>{query || tag || sort !== "latest" ? <Link className="filter-reset" href="/">清除筛选</Link> : null}</form>
      {games.length ? <div className={`game-shelf ${games.length === 1 ? "single-game" : ""}`}>{games.map((game, index) => <article className="game-card" key={game.id}>
        <Link href={`/games/${game.slug}`} className="game-cover-link" aria-label={`查看${game.title}`}><GameCover title={game.title} coverUrl={game.coverUrl} seed={game.id} priority={index === 0} /><span className="cover-open" aria-hidden="true">查看作品 ↗</span></Link>
        <div className="game-card-content"><div className="game-card-top"><div className="tags">{game.tags.slice(0, 3).map(t => <Link key={t} href={buildPageHref({ q: "", tag: t, sort: "latest", pageSize }, 1)}>{t}</Link>)}</div><span className="utility-label">{game.playCount} 次游玩</span></div><h3><Link href={`/games/${game.slug}`}>{game.title}</Link></h3><p className="game-description">{game.description || "作者还没有填写作品介绍。"}</p><div className="game-card-credit"><Link href={getUserProfileHref(game.author)} className="author-link"><AuthorAvatar name={getUserDisplayName(game.author)} avatarUrl={game.author.avatarUrl} />{getUserDisplayName(game.author)}</Link><span>{game.publishedAt?.toLocaleDateString("zh-CN") ?? "未发布"}</span></div><div className="game-card-actions"><Link className="button" href={`/play/${game.id}`}>开始游戏 <span aria-hidden="true">↗</span></Link><Link className="text-link" href={`/games/${game.slug}`}>作品详情</Link><span className="card-social">{game.likeCount} 赞 · {game.favoriteCount} 收藏</span></div></div>
      </article>)}</div> : <div className="empty-state"><span className="empty-mark" aria-hidden="true">＋</span><h3>{query || tag ? "还没有找到这类作品" : "游戏架正在等第一件作品"}</h3><p>{query || tag ? "换个关键词，或清除筛选看看全部作品。" : "上传你的游戏，先试玩，再公开分享。"}</p><Link className="button" href={query || tag ? "/" : "/studio"}>{query || tag ? "查看全部作品" : "打开工作台"}<span aria-hidden="true">→</span></Link></div>}
      {totalGames > 0 ? <nav className="pagination" aria-label="作品分页"><p>第 <strong>{page}</strong> / {totalPages} 页 · {totalGames} 个匹配作品</p><div>{page > 1 ? <Link className="button button-quiet button-small" href={previousHref}>← 上一页</Link> : <span className="pagination-disabled">← 上一页</span>}{page < totalPages ? <Link className="button button-quiet button-small" href={nextHref}>下一页 →</Link> : <span className="pagination-disabled">下一页 →</span>}</div></nav> : null}
    </section><aside className="shelf-endnote"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><div><h2>让你的游戏，拥有自己的位置。</h2><p>私有草稿、试玩预览、版本记录与公开发布，都在同一个工作台。</p></div><Link className="text-link" href="/studio">进入工作台 <span aria-hidden="true">↗</span></Link></aside>
  </div>;
}
