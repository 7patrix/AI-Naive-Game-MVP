import Link from "next/link";
import { notFound } from "next/navigation";
import { GameStatus } from "@prisma/client";
import { db } from "@/lib/db";

type GameDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { slug } = await params;
  const game = await db.game.findUnique({
    where: { slug },
    include: {
      author: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });

  if (!game || game.status !== GameStatus.PUBLISHED) {
    notFound();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div
          className="h-72 bg-cover bg-center"
          style={{
            backgroundImage: game.coverUrl
              ? `url(${game.coverUrl})`
              : "linear-gradient(135deg, #c7d2fe, #e0f2fe, #fae8ff)"
          }}
        />
        <div className="p-8">
          <div className="flex flex-wrap gap-2">
            {game.tags.map((tag) => (
              <span
                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950">{game.title}</h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">{game.description}</p>
        </div>
      </section>

      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">游戏信息</h2>
        <dl className="mt-5 space-y-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">作者</dt>
            <dd className="font-medium text-slate-900">{game.author.name ?? game.author.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">发布时间</dt>
            <dd className="font-medium text-slate-900">
              {game.publishedAt?.toLocaleDateString("zh-CN") ?? "草稿"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">游玩次数</dt>
            <dd className="font-medium text-slate-900">{game.playCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Manifest</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-700">
              {game.manifestUrl ?? "暂未生成"}
            </dd>
          </div>
        </dl>
        <Link
          className="mt-6 inline-flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
          href={`/play/${game.id}`}
        >
          开始游玩
        </Link>
      </aside>
    </div>
  );
}
