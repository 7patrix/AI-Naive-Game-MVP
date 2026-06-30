import Link from "next/link";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    loggedOut?: string;
    next?: string;
    passwordReset?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextParam = params.next ? `?next=${encodeURIComponent(params.next)}` : "";

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">账号</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">登录</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        使用邮箱登录后，可以访问创作者功能并发布生成的游戏。
      </p>
      {params.error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      ) : null}
      {params.loggedOut ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          已退出登录。你可以重新登录或切换账号。
        </div>
      ) : null}
      {params.passwordReset ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          密码已更新，请使用新密码登录。
        </div>
      ) : null}
      <form action="/api/auth/login" className="mt-6 space-y-4" method="post">
        <input name="next" type="hidden" value={params.next ?? ""} />
        <input
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
          name="email"
          placeholder="邮箱，例如 creator@example.com"
          required
          type="email"
        />
        <input
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
          name="password"
          placeholder="密码"
          required
          type="password"
        />
        <button
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white"
          type="submit"
        >
          登录
        </button>
      </form>
      <div className="mt-5 flex items-center justify-between text-sm text-slate-600">
        <Link className="font-semibold text-indigo-700" href="/forgot-password">
          忘记密码？
        </Link>
        <span>
          还没有账号？{" "}
          <Link className="font-semibold text-indigo-700" href="/register">
            去注册
          </Link>
        </span>
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        或
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="space-y-3">
        <a
          className="flex w-full justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800"
          href={`/api/auth/google/start${nextParam}`}
        >
          使用 Google 登录
        </a>
        <a
          className="flex w-full justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800"
          href={`/api/auth/github/start${nextParam}`}
        >
          使用 GitHub 登录
        </a>
      </div>
    </div>
  );
}
