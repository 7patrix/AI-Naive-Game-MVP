import Link from "next/link";

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    sent?: string;
    error?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">账号安全</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">找回密码</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        输入注册邮箱，我们会发送一封重置密码邮件。链接 30 分钟内有效。
      </p>
      {params.sent ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          如果这个邮箱存在账号，重置密码邮件已经发送。请检查收件箱和垃圾邮件箱。
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          发送失败，请稍后重试。
        </div>
      ) : null}
      <form action="/api/auth/forgot-password" className="mt-6 space-y-4" method="post">
        <input
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
          name="email"
          placeholder="邮箱，例如 test@example.com"
          required
          type="email"
        />
        <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" type="submit">
          发送重置邮件
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        想起密码了？{" "}
        <Link className="font-semibold text-indigo-700" href="/login">
          返回登录
        </Link>
      </p>
    </div>
  );
}
