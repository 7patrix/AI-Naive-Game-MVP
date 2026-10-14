"use client";
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
type Game = { id: string; title: string; description: string; plannedPlayMode: string };
export function BuildUploadForm({ game, unavailable }: { game?: Game; unavailable?: string }) {
  const helpId = useId(), router = useRouter(), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const form = new FormData(event.currentTarget), build = form.get("build");
    if (!(build instanceof File) || build.size <= 0 || build.size > 32 * 1024 * 1024) { setError("请选择不超过 32MB 的 ZIP 导出包。"); return; }
    setPending(true);
    try {
      const response = await fetch("/api/studio/games", { method: "POST", body: form }), data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "上传未完成。");
      router.push(data.href); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "上传未完成，请稍后再试。"); }
    finally { setPending(false); }
  }
  const input = "field";

  return <form onSubmit={upload} className="build-upload-form" aria-busy={pending}>
    {game ? <input type="hidden" name="gameId" value={game.id} /> : null}
    <fieldset disabled={pending || Boolean(unavailable)}><legend className="sr-only">{game ? "上传草稿版本" : "创建作品草稿"}</legend>
      <label className="field-label">作品名称 <span>必填</span><input name="title" defaultValue={game?.title} required maxLength={80} className={input} placeholder="给你的世界起个名字" /></label>
      <label className="field-label">作品介绍<textarea name="description" defaultValue={game?.description} maxLength={2000} rows={3} className={input} placeholder="玩家会在这里经历什么？" /></label>
      <div className="field-pair"><label className="field-label">Godot 版本 <span>必填</span><input name="engineVersion" required maxLength={32} placeholder="例如 4.7.2" className={input} /></label><label className="field-label">计划游玩方式<select name="plannedPlayMode" defaultValue={game?.plannedPlayMode ?? "SINGLE_PLAYER"} className={input}><option value="SINGLE_PLAYER">单机</option><option value="MULTIPLAYER">多人</option><option value="BOTH">单机和多人</option></select></label></div>
      <p className="field-help">游玩方式仅记录计划。多人房间尚未开放，当前支持单机发布与预览。</p>
      <label className="field-label">更新说明 <span>必填</span><textarea name="changeSummary" required maxLength={500} rows={2} placeholder={game ? "这次修改了哪些内容？" : "首次上传，介绍一下这版玩法"} className={input} /></label>
      <label className="file-field"><span className="file-field-title"><span aria-hidden="true">↑</span> Godot Web 导出包</span><input name="build" type="file" accept=".zip" required aria-describedby={helpId} /><span className="field-help">选择完整 ZIP 文件 · 最大 32MB</span></label>
      <details className="export-help" id={helpId}><summary>如何准备导出包？</summary><p>以 <code>index.html</code> 导出，关闭线程、扩展和 PWA，将完整导出文件夹压缩为 ZIP。上传最多 32MB，展开后最多 128MB。</p></details>
      <button type="submit" className="button upload-submit">{pending ? "正在校验并上传…" : game ? "上传新草稿版本" : "保存作品草稿"}<span aria-hidden="true">{pending ? "…" : "→"}</span></button>
    </fieldset>
    {unavailable ? <p className="notice" role="status">{unavailable}</p> : null}{error ? <p className="notice notice-error" role="alert">{error}</p> : null}
  </form>;
}
