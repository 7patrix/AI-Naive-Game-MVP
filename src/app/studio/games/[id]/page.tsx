import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { studioConfiguration } from "@/lib/studio-config";
import { GameBuildPlayer } from "@/components/GameBuildPlayer";
import { gameRuntimeOrigin } from "@/lib/game-build-security";
import { BuildUploadForm } from "../../BuildUploadForm";
import { VersionActions } from "../../VersionActions";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string; uploaded?: string }> };
export default async function StudioGamePage({ params, searchParams }: Props) {
  const user = await getCurrentUser(), { id } = await params, query = await searchParams;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/studio/games/${id}`)}`);
  if (!isAdminUser(user)) notFound();
  const game = await db.game.findFirst({ where: { id, authorId: user.id, runtime: "GODOT_WEB" }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 50 } } });
  if (!game) notFound();
  const selected = game.versions.find((version) => version.id === query.preview) ?? game.versions[0], config = studioConfiguration();

  return <div className="page-enter version-page"><div className="breadcrumb"><Link href="/studio">← 我的工作台</Link><span>作品 / 版本管理</span></div><header className="workspace-heading"><div><p className="eyebrow">作品工作区</p><h1 className="display-title">{game.title}</h1><p className="page-intro">{game.status === "PUBLISHED" ? `当前公开版本：v${game.currentVersionNumber}。上传新草稿不会改变公开内容。` : "作品尚未公开。先预览，再选择要发布的版本。"}</p></div>{game.status === "PUBLISHED" ? <Link className="button button-quiet" href={`/games/${game.slug}`}>查看公开作品 <span aria-hidden="true">↗</span></Link> : null}</header>
    {query.uploaded ? <p className="notice notice-success" role="status">草稿版本已保存。请先试玩，检查玩法和存档，再决定是否公开发布。</p> : null}
    <section aria-label="选定版本预览">{selected && config.origin ? <GameBuildPlayer gameId={game.id} versionId={selected.id} title={`${selected.title} · v${selected.versionNumber}`} runtimeOrigin={gameRuntimeOrigin(config.origin, game.id)} preview /> : <div className="notice" role="status">{config.unavailable ?? "还没有可预览的版本。上传一份导出包开始。"}</div>}</section>
    <div className="version-workspace"><section aria-labelledby="versions-heading"><div className="section-title"><h2 id="versions-heading">版本记录 <span className="count-label">{game.versions.length} 个版本</span></h2><span className="utility-label">最新在前</span></div><ol className="version-list">{game.versions.map(version => <li key={version.id} className={`version-card ${selected?.id === version.id ? "version-selected" : ""}`}><div className="version-card-heading"><div><span className="version-number">v{version.versionNumber}</span>{selected?.id === version.id ? <span className="badge badge-preview">正在查看</span> : null}</div><Link href={`/studio/games/${id}?preview=${version.id}`} className="text-link" aria-current={selected?.id === version.id ? "true" : undefined}>选择预览 ↗</Link></div><p className="version-change">{version.changeSummary || "本次更新尚无说明。"}</p><p className="utility-label">Godot {version.engineVersion} · <time>{version.createdAt.toLocaleString("zh-CN")}</time></p><VersionActions gameId={id} versionId={version.id} number={version.versionNumber} current={game.status === "PUBLISHED" && game.currentVersionNumber === version.versionNumber} /></li>)}</ol>{!game.versions.length ? <p className="muted">还没有版本记录。</p> : null}</section><section className="panel version-upload" aria-labelledby="next-version-heading"><p className="eyebrow">继续打磨</p><h2 id="next-version-heading">上传下一个版本</h2><p className="muted">新版本先保存为草稿，当前公开链接保持原样。</p><BuildUploadForm game={game} unavailable={config.unavailable} /></section></div>
  </div>;
}
