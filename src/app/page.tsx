import Link from "next/link";
import { GameStatus } from "@prisma/client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const games = await db.game.findMany({
    where: {
      status: GameStatus.PUBLISHED
    },
    include: {
      author: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      publishedAt: "desc"
    }
  });

  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-slate-200 bg-white/85 p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">
          AI Native 互动游戏平台
        </p>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950 md:text-6xl">
              输入创意，生成、发布并游玩 AI 小游戏。
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              这个 MVP 会打通登录注册、创意生成、对象存储、游戏发布和远端动态游玩的完整闭环。
            </p>
          </div>
          <div className="rounded-2xl bg-slate-950 p-6 text-white">
            <p className="text-sm text-indigo-200">核心流程</p>
            <p className="mt-3 text-2xl font-semibold">
              登录 &rarr; 创建 &rarr; 发布 &rarr; 游玩
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">已发布游戏</h2>
            <p className="mt-1 text-slate-600">
              这些游戏记录来自 PostgreSQL，包括系统预置的演示数据。
            </p>
          </div>
        </div>
        {games.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-3">
            {games.map((game) => (
              <article
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                key={game.id}
              >
                <div
                  className="h-40 bg-cover bg-center"
                  style={{
                    backgroundImage: game.coverUrl
                      ? `url(${game.coverUrl})`
                      : "linear-gradient(135deg, #c7d2fe, #e0f2fe, #fae8ff)"
                  }}
                />
                <div className="p-5">
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
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{game.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{game.description}</p>
                  <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                    <span>作者：{game.author.name ?? game.author.email}</span>
                    <span>{game.playCount} 次游玩</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    发布时间：{game.publishedAt?.toLocaleDateString("zh-CN") ?? "未发布"}
                  </p>
                  <Link
                    className="mt-5 inline-flex w-full justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
                    href={`/games/${game.slug}`}
                  >
                    查看详情
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-slate-600">
            暂时还没有已发布游戏。你可以先导入测试数据，或创建第一个游戏。
          </div>
        )}
      </section>
    </div>
  );
}
