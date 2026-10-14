"use client";
import { useEffect, useRef, useState } from "react";
export function CopyLinkButton({ path }: { path: string }) {
  const [status, setStatus] = useState(""), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() { try { await navigator.clipboard.writeText(new URL(path, location.origin).href); setStatus("链接已复制"); } catch { setStatus("复制失败，请复制地址栏链接"); } if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setStatus(""), 3500); }
  return <span className="share-control"><button type="button" className="button button-quiet" onClick={copy}>复制链接 <span aria-hidden="true">↗</span></button><span className="share-feedback" role="status">{status}</span></span>;
}
