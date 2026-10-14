"use client";
import { useEffect, useRef, useState } from "react";
type Props = { title: string; coverUrl: string | null; seed: string; className?: string; priority?: boolean };
export function GameCover({ title, coverUrl, seed, className = "", priority = false }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A cached/fast failure can happen before React attaches the error listener.
    if (coverUrl && image.current?.complete && image.current.naturalWidth === 0) setFailedUrl(coverUrl);
  }, [coverUrl]);
  const tone = Array.from(seed).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 3;
  return <div className={`game-cover cover-tone-${tone} ${className}`}>
    {coverUrl && coverUrl !== failedUrl ? <img ref={image} src={coverUrl} alt={`${title}的封面`} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => setFailedUrl(coverUrl)} /> : <>
      <svg className="cover-art" viewBox="0 0 600 360" fill="none" aria-hidden="true"><path d="M80 245H190V160H310V95H435V185H525" stroke="currentColor" strokeWidth="2" /><path d="M90 280H490M90 300H370" stroke="currentColor" opacity=".22" /><rect x="252" y="197" width="94" height="76" rx="18" fill="currentColor" opacity=".1" /><path d="M264 226H284M274 216V236" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="320" cy="220" r="4" fill="currentColor" /><circle cx="330" cy="234" r="4" fill="currentColor" /><circle cx="434" cy="94" r="15" stroke="currentColor" strokeWidth="2" /><circle cx="190" cy="160" r="5" fill="currentColor" /><path d="M307 95L315 87M315 103L307 95" stroke="currentColor" strokeWidth="2" /></svg>
      <span className="cover-caption">{coverUrl ? "封面暂不可用" : "尚未设置封面"}</span>
    </>}
    <span className="cover-corner" aria-hidden="true">dm / play</span>
  </div>;
}
