import Link from "next/link";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid: "重置链接无效或已过期，请重新申请。",
  mismatch: "两次输入的密码不一致。",
  password: "密码至少需要 8 位。",
  failed: "重置失败，请稍后重试。"
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">账号安全</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">设置新密码</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        请设置一个至少 8 位的新密码。成功后需要重新登录。
      </p>
      {params.error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessages[params.error] ?? errorMessages.failed}
        </div>
      ) : null}
      {params.token ? (
        <form action="/api/auth/reset-password" className="mt-6 space-y-4" method="post">
          <input name="token" type="hidden" value={params.token} />
          <input
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            minLength={8}
            name="password"
            placeholder="新密码，至少 8 位"
            required
            type="password"
          />
          <input
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            minLength={8}
            name="confirmPassword"
            placeholder="再次输入新密码"
            required
            type="password"
          />
          <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" type="submit">
            更新密码
          </button>
        </form>
      ) : (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          重置链接缺少 token，请重新申请。
        </div>
      )}
      <p className="mt-5 text-center text-sm text-slate-600">
        <Link className="font-semibold text-indigo-700" href="/forgot-password">
          重新发送重置邮件
        </Link>
      </p>
    </div>
  );
}
