"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
type Props = { user: { name: string; isAdmin: boolean } | null };
export function SiteNavigation({ user }: Props) {
  const pathname = usePathname(), [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null), account = useRef<HTMLDetailsElement>(null);
  useEffect(() => { setOpen(false); if (account.current) account.current.open = false; }, [pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { if (open) { setOpen(false); toggle.current?.focus(); } if (account.current?.open) { account.current.open = false; account.current.querySelector("summary")?.focus(); } } };
    const outside = (event: PointerEvent) => { if (account.current?.open && !account.current.contains(event.target as Node)) account.current.open = false; };
    document.addEventListener("keydown", close); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  return <header className="site-header"><div className="site-nav">
    <Link className="brand" href="/" aria-label="Duckmole，返回游戏架"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><span className="brand-word">duckmole<span className="brand-caption">独立游戏工坊</span></span></Link>
    <button ref={toggle} className="mobile-toggle" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)} aria-label={open ? "收起导航" : "打开导航"}><span aria-hidden="true">{open ? "×" : "☰"}</span></button>
    <nav id="primary-navigation" className={`primary-nav ${open ? "is-open" : ""}`} aria-label="主导航">
      <Link onClick={() => setOpen(false)} aria-current={active("/") ? "page" : undefined} href="/">游戏架</Link>
      {user?.isAdmin ? <Link onClick={() => setOpen(false)} aria-current={active("/studio") ? "page" : undefined} href="/studio">我的工作台</Link> : null}
      <Link onClick={() => setOpen(false)} aria-current={active("/users") ? "page" : undefined} href="/users">创作者</Link>
    </nav>
    <div className="nav-tools"><Link className="nav-ai" href="/create">AI 创作 <span aria-hidden="true">↗</span></Link>
      {user ? <details ref={account} className="account-menu"><summary aria-label={`账户：${user.name}`}><span className="avatar-dot">{user.name.slice(0, 1).toUpperCase()}</span><span className="account-name">{user.name}</span><span aria-hidden="true">⌄</span></summary><div className="account-panel"><p>你的账户</p><Link href="/account/profile">个人资料</Link><Link href="/account/api-keys">API 管理</Link>{user.isAdmin ? <Link href="/admin">管理后台</Link> : null}<form action="/api/auth/logout" method="post"><button type="submit">退出登录</button></form></div></details> : <details ref={account} className="account-menu"><summary aria-label="登录或注册账户"><span className="avatar-dot" aria-hidden="true">↗</span><span className="account-name">登录 / 注册</span><span aria-hidden="true">⌄</span></summary><div className="account-panel"><p>加入 Duckmole</p><Link href="/login">登录</Link><Link href="/register">注册账户</Link></div></details>}
    </div>
  </div></header>;
}
