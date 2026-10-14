"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function VersionActions({ gameId, versionId, number, current }: { gameId: string; versionId: string; number: number; current: boolean }) {
  const router = useRouter(), [checked, setChecked] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  if (current) return <p className="current-version"><span className="status-dot" /> 当前公开版本</p>;
  async function publish() {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/studio/games/${gameId}/versions/${versionId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifiedByAuthor: checked }) }), data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "发布未完成。");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "发布未完成。"); }
    finally { setPending(false); }
  }

  return <div className="version-actions" aria-busy={pending}><label className="publish-consent"><input type="checkbox" checked={checked} disabled={pending} onChange={event => setChecked(event.target.checked)} /><span>我已试玩 v{number}，同意公开这个版本。<small>所有人都可访问，原公开版本将被替换。</small></span></label><button type="button" disabled={!checked || pending} onClick={publish} className="button button-small">{pending ? "正在发布…" : `公开发布 v${number}`}<span aria-hidden="true">↗</span></button>{error ? <p className="notice notice-error" role="alert">{error}</p> : null}</div>;
}
