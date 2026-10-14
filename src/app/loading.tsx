export default function PageLoading() {
  return <section className="page-feedback" role="status" aria-live="polite" aria-busy="true">
    <span className="page-loading-mark" aria-hidden="true" /><p className="page-intro">正在打开页面…</p>
  </section>;
}
