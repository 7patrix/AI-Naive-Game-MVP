import Link from "next/link";
import { MoonKillerPlayer } from "@/components/MoonKillerPlayer";
export const metadata = { title: "雾钟镇 · 第一夜 | Duckmole" };
export default function MoonKillerPage() {
  return <div className="page-enter play-page"><div className="breadcrumb"><Link href="/">← 游戏架</Link><span>特别试玩</span></div><header className="play-heading"><div><p className="eyebrow">MoonKiller / 第一夜 · 送信人</p><h1>雾钟镇</h1><p className="page-intro">在黄昏的小镇送出三封信。井边的绳子、两盏灯油，会把这一夜带向不同的方向。</p></div><span className="badge badge-live">Godot 网页版</span></header><MoonKillerPlayer /><p className="field-help">首次加载约 98MB。当前为 10 月 9 日验收版本，默认静音，可在游戏内调整声音。试玩进度仅保留在本局。</p></div>;
}
