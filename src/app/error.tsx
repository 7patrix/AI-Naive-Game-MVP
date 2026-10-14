"use client";
import Link from "next/link";
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="panel page-feedback" aria-labelledby="page-error-heading">
    <p className="eyebrow">Duckmole</p><h1 id="page-error-heading" className="display-title">页面暂时未能打开</h1>
    <p className="page-intro" role="alert">请稍后重试。如果问题持续，可以先返回游戏架。</p>
    <div className="page-feedback-actions"><button type="button" className="button" onClick={reset}>重新加载</button><Link href="/" className="button button-quiet">返回游戏架</Link></div>
  </section>;
}
