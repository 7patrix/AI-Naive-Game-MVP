"use client";
import { useEffect, useRef, useState } from "react";
export function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (avatarUrl && image.current?.complete && image.current.naturalWidth === 0) setFailedUrl(avatarUrl);
  }, [avatarUrl]);
  return <span className="avatar-dot" aria-hidden="true">{avatarUrl && avatarUrl !== failedUrl ? <img ref={image} src={avatarUrl} alt="" loading="lazy" onError={() => setFailedUrl(avatarUrl)} /> : Array.from(name)[0]}</span>;
}
