import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserDisplayName, getUserProfileHref } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  searchParams: Promise<{
    saved?: string;
    avatar?: string;
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid: "请检查资料格式。用户名需 3-30 位，只能包含小写字母、数字、下划线和短横线。",
  username_taken: "这个用户名已经被使用。",
  avatar: "头像上传失败，请确认图片格式和大小。",
  failed: "保存失败，请稍后重试。"
};

export default async function AccountProfilePage({ searchParams }: ProfilePageProps) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login?next=/account/profile");
  }

  const params = await searchParams;
  const user = await db.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      bio: true,
      websiteUrl: true,
      avatarUrl: true,
      createdAt: true
    }
  });

  if (!user) {
    redirect("/login?next=/account/profile");
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/70 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-200/70">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">账户设置</p>
        <h1 className="mt-3 text-3xl font-bold">个人资料</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          设置你的公开头像、昵称和简介，让其他玩家可以了解你的创作。
        </p>
      </section>

      {params.saved || params.avatar ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          资料已更新。
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          {errorMessages[params.error] ?? errorMessages.failed}
        </div>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-950">公开名片</h2>
          <div className="mt-6 flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                alt={getUserDisplayName(user)}
                className="h-20 w-20 rounded-3xl object-cover"
                src={user.avatarUrl}
              />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-3xl bg-slate-950 text-2xl font-bold text-white">
                {getUserDisplayName(user).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-xl font-bold text-slate-950">{getUserDisplayName(user)}</h3>
              <p className="mt-1 text-sm text-slate-500">{user.username ? `@${user.username}` : user.email}</p>
              <a className="mt-2 inline-flex text-sm font-semibold text-indigo-700" href={getUserProfileHref(user)}>
                查看公开主页
              </a>
            </div>
          </div>
          <form action="/api/account/avatar" className="mt-6 space-y-3" encType="multipart/form-data" method="post">
            <input
              accept="image/png,image/jpeg,image/webp"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
              name="avatar"
              required
              type="file"
            />
            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" type="submit">
              上传头像
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-950">编辑资料</h2>
          <form action="/api/account/profile" className="mt-6 space-y-4" method="post">
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              defaultValue={user.name ?? ""}
              maxLength={80}
              name="name"
              placeholder="昵称"
            />
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              defaultValue={user.username ?? ""}
              maxLength={30}
              name="username"
              placeholder="用户名，例如 patrix"
            />
            <textarea
              className="min-h-28 w-full rounded-xl border border-slate-300 px-4 py-3"
              defaultValue={user.bio ?? ""}
              maxLength={240}
              name="bio"
              placeholder="一句话介绍你的创作风格"
            />
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
              defaultValue={user.websiteUrl ?? ""}
              name="websiteUrl"
              placeholder="个人链接，可选"
              type="url"
            />
            <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" type="submit">
              保存资料
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
