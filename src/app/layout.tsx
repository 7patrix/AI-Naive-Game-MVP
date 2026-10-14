import type { Metadata } from "next";
import Link from "next/link";
import { SiteNavigation } from "@/components/SiteNavigation";
import { getCurrentUser, isAdminUser } from "@/lib/auth";
import { getUserDisplayName } from "@/lib/user-profile";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Duckmole · 独立游戏工坊", template: "%s · Duckmole" }, description: "制作、发布和游玩你的游戏" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return <html lang="zh-CN"><body><a className="skip-link" href="#main-content">跳转到主要内容</a><SiteNavigation user={user ? { name: getUserDisplayName(user), isAdmin: isAdminUser(user) } : null} /><main id="main-content" className="site-main" tabIndex={-1}>{children}</main><footer className="site-footer"><Link href="/" className="footer-brand">duckmole <span>小小世界，认真制作。</span></Link><a href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank">浙ICP备2026051458号-1</a></footer></body></html>;
}
