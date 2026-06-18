import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
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

  return (
    <html lang="zh-CN">
      <body>
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link className="text-lg font-semibold tracking-tight" href="/">
              AI 游戏工坊
            </Link>
            <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <Link href="/create">创建</Link>
              {user ? (
                <>
                  <span className="hidden text-slate-500 sm:inline">{user.email}</span>
                  <form action="/api/auth/logout" method="post">
                    <button className="font-medium text-slate-600" type="submit">
                      退出登录
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login">登录</Link>
                  <Link
                    className="rounded-full bg-slate-950 px-4 py-2 text-white"
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
