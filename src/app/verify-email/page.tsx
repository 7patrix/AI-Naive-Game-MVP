import Link from "next/link";

type VerifyEmailPageProps = {
  searchParams: Promise<{
    email?: string;
    error?: string;
  }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">邮箱验证</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">请查收验证邮件</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        我们已经向{params.email ? ` ${params.email} ` : "你的邮箱"}发送了验证链接。点击邮件中的链接后，
        你会自动登录并进入 Create 工作台。
      </p>
      {params.error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      ) : null}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        如果没有收到邮件，请检查垃圾邮件箱；也可以回到登录页重新登录一次，系统会重新发送验证链接。
      </div>
      <div className="mt-6 flex gap-3">
        <Link
          className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white"
          href="/login"
        >
          去登录
        </Link>
        <Link
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-center font-semibold text-slate-700"
          href="/register"
        >
          重新注册
        </Link>
      </div>
    </div>
  );
}
