import Link from "next/link";
import { GameCover } from "@/components/GameCover";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { notFound } from "next/navigation";
import { GameEventType, GameStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { remoteGameManifestSchema, type RemoteGameManifest } from "@/lib/game-manifest";
import { getUserDisplayName, getUserProfileHref } from "@/lib/user-profile";

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

export default async function GameDetailPage({ params, searchParams }: GameDetailPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();
  const game = await db.game.findUnique({
    where: { slug },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          avatarUrl: true
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
        where: { buildStatus: "PUBLISHED" },
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
  let manifest: RemoteGameManifest | null = null;
  if (game.manifestUrl) {
    try {
      const response = await fetch(game.manifestUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const parsed = remoteGameManifestSchema.safeParse(await response.json());
        manifest = parsed.success ? parsed.data : null;
      }
    } catch {
      manifest = null;
    }
  }
  const countByType = new Map(eventCounts.map((item) => [item.type, item._count.type]));
  const likedByMe = user ? game.likes.length > 0 : false;
  const favoritedByMe = user ? game.favorites.length > 0 : false;


  return <div className="page-enter detail-page"><div className="breadcrumb"><Link href="/">← 游戏架</Link><span>作品详情</span></div>
    {query.reported ? <p className="notice notice-success" role="status">举报已提交，平台维护者会在管理后台处理。</p> : null}{query.reportError ? <p className="notice notice-error" role="alert">举报提交失败，请填写有效原因后重试。</p> : null}
    <div className="detail-top"><header><div className="tags">{game.tags.map(tag => <Link href={`/?tag=${encodeURIComponent(tag)}`} key={tag}>{tag}</Link>)}</div><h1 className="display-title">{game.title}</h1><Link className="author-link" href={getUserProfileHref(game.author)}><span className="avatar-dot">{game.author.avatarUrl ? <img src={game.author.avatarUrl} alt="" /> : getUserDisplayName(game.author).slice(0, 1)}</span>{getUserDisplayName(game.author)}<span className="muted">制作</span></Link></header><div className="detail-primary"><CopyLinkButton path={`/games/${game.slug}`} /><Link className="button" href={`/play/${game.id}`}>开始游玩 <span aria-hidden="true">↗</span></Link></div></div>
    <div className="detail-grid"><div><GameCover title={game.title} coverUrl={game.coverUrl} seed={game.id} className="detail-cover" priority /><section className="detail-description"><p className="eyebrow">关于这件作品</p><h2>一个怎样的世界？</h2><p>{game.description || "作者还没有填写作品介绍。"}</p></section>
      <section className="detail-section"><div className="section-title"><h2>版本记录</h2><span className="utility-label">当前 v{game.currentVersionNumber}</span></div>{game.versions.length ? <ol className="public-version-list">{game.versions.map(version => <li key={version.id}><span className="version-number">v{version.versionNumber}</span><div><p>{version.changeSummary || "作者没有填写本次更新说明。"}</p><time>{version.createdAt.toLocaleDateString("zh-CN")}</time></div>{version.versionNumber === game.currentVersionNumber ? <span className="badge badge-live">当前版本</span> : null}</li>)}</ol> : <p className="muted">暂无版本记录。</p>}</section>
      {game.runtime === "HTML" || game.remixes.length || game.parentGame ? <section className="detail-section"><div className="section-title"><h2>派生与灵感</h2>{game.runtime === "HTML" ? <Link className="text-link" href={user ? `/create?remixGameId=${game.id}` : `/login?next=${encodeURIComponent(`/create?remixGameId=${game.id}`)}`}>Remix 这件作品 ↗</Link> : null}</div>{game.parentGame ? <p className="muted">源自 <Link className="text-link" href={`/games/${game.parentGame.slug}`}>{game.parentGame.title} v{game.parentGame.currentVersionNumber}</Link></p> : null}{game.remixes.length ? <ul className="remix-list">{game.remixes.map(remix => <li key={remix.id}><Link href={`/games/${remix.slug}`}>{remix.title} ↗</Link><time>{remix.publishedAt?.toLocaleDateString("zh-CN") ?? "未发布"}</time></li>)}</ul> : <p className="muted">暂无公开 Remix。</p>}</section> : null}
    </div><aside className="detail-sidebar"><section className="panel"><p className="eyebrow">开始之前</p><h2>游戏信息</h2><dl className="info-list"><div><dt>公开日期</dt><dd>{game.publishedAt?.toLocaleDateString("zh-CN") ?? "未发布"}</dd></div><div><dt>当前版本</dt><dd className="mono">v{game.currentVersionNumber}</dd></div><div><dt>游玩次数</dt><dd className="mono">{game.playCount}</dd></div><div><dt>设备支持</dt><dd>{manifest ? manifest.supportedDevices.map(formatDevice).join(" / ") : game.runtime === "GODOT_WEB" ? "以实际设备试玩为准" : game.manifestUrl ? "按游戏内提示操作" : "准备中"}</dd></div>{manifest ? <><div><dt>操作方式</dt><dd>{manifest.inputMethods.map(formatInputMethod).join(" / ")}</dd></div><div><dt>操作提示</dt><dd>{manifest.controlHints.movement ?? "按游戏内提示操作"}</dd></div></> : null}<div><dt>可玩状态</dt><dd>{game.runtime === "GODOT_WEB" || game.manifestUrl ? "可打开游戏" : "准备中"}</dd></div></dl><div className="social-actions"><form action={`/api/games/${game.id}/like`} method="post"><button className="button button-quiet" type="submit">{likedByMe ? "取消点赞" : "点赞"} <span className="mono">{game._count.likes}</span></button></form><form action={`/api/games/${game.id}/favorite`} method="post"><button className="button button-quiet" type="submit">{favoritedByMe ? "取消收藏" : "收藏"} <span className="mono">{game._count.favorites}</span></button></form></div></section>
      <details className="panel secondary-details"><summary>游玩记录 <span className="mono">{game._count.events}</span></summary><div className="event-stats"><div><strong>{countByType.get(GameEventType.PLAY_START) ?? 0}</strong><span>开始</span></div><div><strong>{countByType.get(GameEventType.PLAY_LOADED) ?? 0}</strong><span>加载成功</span></div><div><strong>{countByType.get(GameEventType.PLAY_ERROR) ?? 0}</strong><span>加载失败</span></div></div>{game.events.length ? <ul className="event-list">{game.events.map(event => <li key={event.id}><span>{event.type}</span><time>{event.createdAt.toLocaleString("zh-CN")}</time></li>)}</ul> : <p className="muted">暂无游玩记录。</p>}</details>
      <details className="panel secondary-details report-panel"><summary>反馈作品问题</summary><p className="muted">不当内容或资源问题，可以提交给平台维护者。</p><form action={`/api/games/${game.id}/report`} method="post"><label className="field-label">举报原因<select className="field" name="reason" required><option value="">选择举报原因</option><option value="不安全或违规内容">不安全或违规内容</option><option value="无法正常游玩">无法正常游玩</option><option value="侵权或不当素材">侵权或不当素材</option><option value="垃圾内容或低质量">垃圾内容或低质量</option></select></label><label className="field-label">补充说明<span>可选</span><textarea className="field" name="details" maxLength={500} rows={3} placeholder="请具体说明遇到的问题" /></label><button type="submit" className="button button-quiet button-small">提交反馈</button></form><p className="utility-label">已有 {game._count.reports} 条举报</p></details>
    </aside></div>
  </div>;
}
