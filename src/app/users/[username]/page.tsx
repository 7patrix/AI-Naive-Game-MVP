import Link from "next/link";
import { notFound } from "next/navigation";
import { GameStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserDisplayName } from "@/lib/user-profile";

type UserProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { username } = await params;
  const user = await db.user.findFirst({
    where: {
      OR: [{ username }, { id: username }]
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      bio: true,
      websiteUrl: true,
      avatarUrl: true,
      createdAt: true,
      games: {
        where: { status: GameStatus.PUBLISHED },
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          coverUrl: true,
          tags: true,
          playCount: true,
          likeCount: true,
          favoriteCount: true,
          publishedAt: true
        }
      }
    }
  });

  if (!user) {
    notFound();
  }

  const displayName = getUserDisplayName(user);
  const totalPlays = user.games.reduce((total, game) => total + game.playCount, 0);
  const totalLikes = user.games.reduce((total, game) => total + game.likeCount, 0);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/70 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-200/70">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          {user.avatarUrl ? (
            <img alt={displayName} className="h-24 w-24 rounded-3xl object-cover" src={user.avatarUrl} />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-3xl bg-white text-3xl font-bold text-slate-950">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">创作者</p>
            <h1 className="mt-2 text-3xl font-bold">{displayName}</h1>
            <p className="mt-1 text-sm text-slate-300">{user.username ? `@${user.username}` : "未设置用户名"}</p>
            {user.bio ? <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200">{user.bio}</p> : null}
            {user.websiteUrl ? (
              <a className="mt-3 inline-flex text-sm font-semibold text-indigo-200" href={user.websiteUrl} rel="noreferrer" target="_blank">
                个人链接
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Metric label="发布作品" value={user.games.length} />
          <Metric label="总游玩" value={totalPlays} />
          <Metric label="总点赞" value={totalLikes} />
          <Metric label="加入时间" value={user.createdAt.toLocaleDateString("zh-CN")} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-950">发布的游戏</h2>
        {user.games.length > 0 ? (
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {user.games.map((game) => (
              <article className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl shadow-slate-200/60" key={game.id}>
                <div
                  className="h-44 bg-cover bg-center"
                  style={{
                    backgroundImage: game.coverUrl
                      ? `url(${game.coverUrl})`
                      : "linear-gradient(135deg, #c7d2fe, #e0f2fe, #fae8ff)"
                  }}
                />
                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {game.tags.map((tag) => (
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{game.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{game.description}</p>
                  <p className="mt-4 text-xs text-slate-500">
                    {game.playCount} 次游玩 / {game.likeCount} 赞 / {game.favoriteCount} 收藏
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link className="inline-flex justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700" href={`/games/${game.slug}`}>
                      详情
                    </Link>
                    <Link className="inline-flex justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" href={`/play/${game.id}`}>
                      开始游戏
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-white p-6 text-sm text-slate-500">这个创作者还没有公开作品。</p>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-5">
      <p className="text-sm text-slate-300">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
