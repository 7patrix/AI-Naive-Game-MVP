import Link from "next/link";
import { MoonKillerPlayer } from "@/components/MoonKillerPlayer";
import { MOONKILLER_DOWNLOAD_MB } from "@/lib/moonkiller";
export const metadata = { title: "雾钟镇 · 第一夜 | Duckmole" };
export default function MoonKillerPage() {
  return <div className="page-enter play-page"><div className="breadcrumb"><Link href="/">← 游戏架</Link><span>特别试玩</span></div><header className="play-heading"><div><p className="eyebrow">MoonKiller / 第一夜 · 送信人</p><h1>雾钟镇</h1><p className="page-intro">在黄昏的小镇送出三封信。井边的绳子、两盏灯油，会把这一夜带向不同的方向。送信之外，还可以替阿槐回应门边的敲击。</p></div><span className="badge badge-live">Godot 网页版</span></header><MoonKillerPlayer /><p className="field-help">首次加载约 {MOONKILLER_DOWNLOAD_MB}MB。10 月 14 日品质切片加入「门外第三声」、居民肖像和进度存档。默认静音，可在游戏内调整声音。进度保存在当前浏览器；刷新恢复至安全落脚点，开启新旅程请使用游戏内的重新开始。</p></div>;
}
