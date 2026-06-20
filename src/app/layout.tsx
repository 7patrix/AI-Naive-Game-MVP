import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isAdminUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 游戏工坊 MVP",
  description: "AI Native 互动游戏平台 MVP"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const isAdmin = isAdminUser(user);

  return (
    <html lang="zh-CN">
      <body>
        <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 shadow-sm shadow-slate-200/40 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight" href="/">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-950 text-sm text-white shadow-lg shadow-indigo-500/20">
                AI
              </span>
              <span>游戏工坊</span>
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <Link className="transition hover:text-indigo-700" href="/create">创建</Link>
              {isAdmin ? <Link className="transition hover:text-indigo-700" href="/admin">管理后台</Link> : null}
              {user ? (
                <>
                  <span className="hidden text-slate-500 sm:inline">{user.email}</span>
                  <form action="/api/auth/logout" method="post">
                    <button className="font-medium text-slate-600 transition hover:text-red-600" type="submit">
                      退出登录
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link className="transition hover:text-indigo-700" href="/login">登录</Link>
                  <Link
                    className="rounded-full bg-slate-950 px-4 py-2 text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-indigo-700"
                    href="/register"
                  >
                    注册
                  </Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
