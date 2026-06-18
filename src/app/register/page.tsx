import Link from "next/link";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">账号</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">注册账号</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        使用邮箱和密码创建账号。密码会先加密哈希，再写入数据库。
      </p>
      {params.error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      ) : null}
      <form action="/api/auth/register" className="mt-6 space-y-4" method="post">
        <input
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
          name="name"
          placeholder="昵称"
          type="text"
        />
        <input
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
          name="email"
          placeholder="邮箱，例如 test@example.com"
          required
          type="email"
        />
        <input
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
          minLength={8}
          name="password"
          placeholder="密码，至少 8 位"
          required
          type="password"
        />
        <button
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white"
          type="submit"
        >
          注册
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        已经有账号？{" "}
        <Link className="font-semibold text-indigo-700" href="/login">
          去登录
        </Link>
      </p>
    </div>
  );
}
