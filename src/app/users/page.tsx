import Link from "next/link";
import { GameStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserDisplayName, getUserProfileHref } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      bio: true,
      avatarUrl: true,
      createdAt: true,
      games: {
        where: { status: GameStatus.PUBLISHED },
        select: {
          id: true,
          playCount: true,
          likeCount: true,
          favoriteCount: true
        }
      }
    },
    take: 100
  });
  const rankedUsers = users
    .map((user) => {
      const publishedCount = user.games.length;
      const totalPlays = user.games.reduce((total, game) => total + game.playCount, 0);
      const totalLikes = user.games.reduce((total, game) => total + game.likeCount, 0);
      const totalFavorites = user.games.reduce((total, game) => total + game.favoriteCount, 0);

      return {
        ...user,
        publishedCount,
        totalPlays,
        totalLikes,
        totalFavorites,
        score: totalPlays + totalLikes * 5 + totalFavorites * 3 + publishedCount * 20
      };
    })
    .filter((user) => user.publishedCount > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 30);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/70 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-200/70">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">社区</p>
        <h1 className="mt-3 text-3xl font-bold">创作者榜</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          发现正在创作热门小游戏的玩家，查看他们的作品和个人主页。
        </p>
      </section>

      <section className="grid gap-4">
        {rankedUsers.length > 0 ? (
          rankedUsers.map((user, index) => (
            <Link
              className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white p-5 shadow-lg shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-indigo-200/60 md:flex-row md:items-center md:justify-between"
              href={getUserProfileHref(user)}
              key={user.id}
            >
              <div className="flex items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-lg font-bold text-indigo-700">
                  {index + 1}
                </div>
                {user.avatarUrl ? (
                  <img alt={getUserDisplayName(user)} className="h-14 w-14 rounded-2xl object-cover" src={user.avatarUrl} />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 font-bold text-white">
                    {getUserDisplayName(user).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-slate-950">{getUserDisplayName(user)}</h2>
                  <p className="text-sm text-slate-500">{user.username ? `@${user.username}` : user.email}</p>
                  {user.bio ? <p className="mt-1 line-clamp-1 text-sm text-slate-600">{user.bio}</p> : null}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm md:min-w-80">
                <Metric label="作品" value={user.publishedCount} />
                <Metric label="游玩" value={user.totalPlays} />
                <Metric label="点赞" value={user.totalLikes} />
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">暂时还没有公开创作者。</p>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-lg font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
