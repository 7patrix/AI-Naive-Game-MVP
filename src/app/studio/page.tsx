import Link from "next/link";
import { GameCover } from "@/components/GameCover";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { studioConfiguration } from "@/lib/studio-config";
import { BuildUploadForm } from "./BuildUploadForm";
export const dynamic = "force-dynamic";
export default async function StudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/studio");
  if (!isAdminUser(user)) return <p>作品工作台目前只向平台作者开放。</p>;
  const games = await db.game.findMany({ where: { authorId: user.id, runtime: "GODOT_WEB" }, include: { _count: { select: { versions: true } } }, orderBy: { updatedAt: "desc" }, take: 50 });
  const config = studioConfiguration();

  const drafts = games.filter(game => game.status === "DRAFT").length;
  const published = games.filter(game => game.status === "PUBLISHED").length;
  return <div className="page-enter studio-page"><header className="workspace-heading"><div><p className="eyebrow">Duckmole / 我的工作台</p><h1 className="display-title">今天，做点好玩的。</h1><p className="page-intro">让想法留在草稿里，让准备好的作品被更多人看见。</p></div><a className="button" href="#new-game">＋ 新作品</a></header>
    <div className="workspace-summary"><span><strong>{games.length}</strong> 个作品</span><span><i className="status-dot draft-dot" /><strong>{drafts}</strong> 个私有草稿</span><span><i className="status-dot" /><strong>{published}</strong> 个公开作品</span><p>已载入最近 {games.length} 件作品</p></div>
    <section aria-labelledby="my-games-heading"><div className="section-title"><h2 id="my-games-heading">我的作品</h2><span className="utility-label">最近更新优先</span></div>{games.length ? <div className="studio-game-list">{games.map(game => <Link href={`/studio/games/${game.id}`} className="studio-game-row" key={game.id}><GameCover title={game.title} coverUrl={game.coverUrl} seed={game.id} /><div className="studio-game-main"><div className="studio-game-title"><h3>{game.title}</h3><span className={`badge ${game.status === "PUBLISHED" ? "badge-live" : game.status === "ARCHIVED" ? "badge-muted" : "badge-draft"}`}>{game.status === "PUBLISHED" ? `公开 v${game.currentVersionNumber}` : game.status === "ARCHIVED" ? "已下架" : "私有草稿"}</span></div><p>{game.description || "尚未填写作品介绍"}</p></div><div className="studio-game-meta"><span className="mono">{game._count.versions} 个版本</span><span>更新于 {game.updatedAt.toLocaleDateString("zh-CN")}</span></div><span className="row-arrow" aria-hidden="true">↗</span></Link>)}</div> : <div className="empty-state"><span className="empty-mark" aria-hidden="true">＋</span><h3>第一件作品，从一份导出包开始。</h3><p>新作品先保留为私有草稿，预览后再决定是否发布。</p><a className="button" href="#new-game">上传第一件作品 →</a></div>}</section>
    <section id="new-game" className="studio-upload-section" aria-labelledby="new-game-heading"><div className="studio-upload-intro"><p className="eyebrow">下一件作品</p><h2 id="new-game-heading">给新世界，<br />留一个位置。</h2><p>在 Godot 中制作，在这里上传与分享。每次修改都留下一个版本，发布由你决定。</p><ol className="workflow-list"><li><span>1</span><div><strong>上传导出包</strong><p>完整 ZIP，以私有草稿保存。</p></div></li><li><span>2</span><div><strong>先完整试玩</strong><p>检查玩法、输入与浏览器存档。</p></div></li><li><span>3</span><div><strong>确认后公开</strong><p>公开链接始终指向你选定的版本。</p></div></li></ol></div><div className="panel upload-panel"><BuildUploadForm unavailable={config.unavailable} /></div></section>
  </div>;
}
