import { ApiCredentialSource } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type ApiKeysPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    tested?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid: "请检查 API 配置信息是否完整。",
  not_found: "没有找到这条 API 配置。",
  delete_failed: "删除失败，请稍后重试。",
  encryption_missing: "服务器尚未配置 API key 加密密钥。"
};

export default async function ApiKeysPage({ searchParams }: ApiKeysPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/account/api-keys");
  }

  const params = await searchParams;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [credentials, totalJobs, userKeyJobs, jobs24h, totalCost, cost24h] = await Promise.all([
    db.userApiCredential.findMany({
      where: { userId: user.id },
      orderBy: [{ isEnabled: "desc" }, { updatedAt: "desc" }]
    }),
    db.generationJob.count({
      where: { userId: user.id }
    }),
    db.generationJob.count({
      where: {
        userId: user.id,
        apiCredentialSource: ApiCredentialSource.USER_KEY
      }
    }),
    db.generationJob.count({
      where: {
        userId: user.id,
        createdAt: {
          gte: since24h
        }
      }
    }),
    db.generationJob.aggregate({
      where: { userId: user.id },
      _sum: {
        estimatedCostCents: true
      }
    }),
    db.generationJob.aggregate({
      where: {
        userId: user.id,
        createdAt: {
          gte: since24h
        }
      },
      _sum: {
        estimatedCostCents: true
      }
    })
  ]);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/70 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-200/70">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">账户设置</p>
        <h1 className="mt-3 text-3xl font-bold">API 管理</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          连接你自己的 OpenAI-compatible API。启用后，新生成任务会优先使用你的 API；未配置时仍会使用平台默认额度。
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Metric label="总生成任务" value={totalJobs} />
          <Metric label="24 小时任务" value={jobs24h} />
          <Metric label="使用自带 API" value={userKeyJobs} />
          <Metric
            label="24 小时成本"
            value={`${((cost24h._sum.estimatedCostCents ?? 0) / 100).toFixed(2)} USD`}
          />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          累计估算成本：{((totalCost._sum.estimatedCostCents ?? 0) / 100).toFixed(2)} USD
        </p>
      </section>

      {params.saved ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          API 配置已保存。
        </div>
      ) : null}
      {params.tested === "success" ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          API 连接测试成功，可以用于生成任务。
        </div>
      ) : null}
      {params.tested === "failed" ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          API 连接测试失败，请检查 key、Base URL、模型名称和协议类型。
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          {errorMessages[params.error] ?? "操作失败，请稍后重试。"}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-950">添加 API 配置</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          API Key 只会加密保存在服务器中，页面不会再次显示完整内容。
        </p>
        <CredentialForm />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-950">我的 API 配置</h2>
        <div className="mt-5 space-y-4">
          {credentials.length > 0 ? (
            credentials.map((credential) => (
              <article className="rounded-2xl border border-slate-200 p-5" key={credential.id}>
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">{credential.name}</h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          credential.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {credential.isEnabled ? "已启用" : "已禁用"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {credential.modelName} / {credential.wireApi} / key 尾号 {credential.apiKeyLast4}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      测试状态：
                      <span
                        className={
                          credential.lastTestStatus === "SUCCEEDED"
                            ? "font-semibold text-emerald-700"
                            : credential.lastTestStatus === "FAILED"
                              ? "font-semibold text-red-600"
                              : "font-semibold text-slate-500"
                        }
                      >
                        {credential.lastTestStatus === "SUCCEEDED"
                          ? "可用"
                          : credential.lastTestStatus === "FAILED"
                            ? "失败"
                            : "未测试"}
                      </span>
                      {credential.lastTestedAt ? ` / ${credential.lastTestedAt.toLocaleString("zh-CN")}` : ""}
                    </p>
                    {credential.lastTestError ? (
                      <p className="mt-1 line-clamp-2 text-xs text-red-600">{credential.lastTestError}</p>
                    ) : null}
                    <p className="mt-1 break-all text-xs text-slate-500">{credential.baseUrl}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      更新于 {credential.updatedAt.toLocaleString("zh-CN")}
                      {credential.lastUsedAt ? ` / 最近使用 ${credential.lastUsedAt.toLocaleString("zh-CN")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={`/api/account/api-credentials/${credential.id}/test`} method="post">
                      <button className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700" type="submit">
                        测试连接
                      </button>
                    </form>
                    <form action={`/api/account/api-credentials/${credential.id}/toggle`} method="post">
                      <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" type="submit">
                        {credential.isEnabled ? "禁用" : "启用"}
                      </button>
                    </form>
                    <form action={`/api/account/api-credentials/${credential.id}/delete`} method="post">
                      <button
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                        type="submit"
                      >
                        删除
                      </button>
                    </form>
                  </div>
                </div>
                <details className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">更新配置</summary>
                  <CredentialForm
                    credential={{
                      id: credential.id,
                      name: credential.name,
                      baseUrl: credential.baseUrl,
                      modelName: credential.modelName,
                      wireApi: credential.wireApi
                    }}
                  />
                </details>
              </article>
            ))
          ) : (
            <p className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">
              暂无 API 配置。你可以先继续使用平台默认额度。
            </p>
          )}
        </div>
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

function CredentialForm({
  credential
}: {
  credential?: {
    id: string;
    name: string;
    baseUrl: string;
    modelName: string;
    wireApi: string;
  };
}) {
  return (
    <form action="/api/account/api-credentials" className="mt-6 grid gap-4" method="post">
      {credential ? <input name="credentialId" type="hidden" value={credential.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <input
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          defaultValue={credential?.name ?? "OpenAI-compatible"}
          name="name"
          placeholder="配置名称"
          required
        />
        <select
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
          defaultValue={credential?.wireApi ?? "chat"}
          name="wireApi"
        >
          <option value="chat">Chat Completions</option>
          <option value="responses">Responses / Vision</option>
        </select>
      </div>
      <input
        className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
        defaultValue={credential?.baseUrl ?? "https://api.openai.com/v1"}
        name="baseUrl"
        placeholder="Base URL"
        required
        type="url"
      />
      <input
        className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
        defaultValue={credential?.modelName ?? "gpt-5.5"}
        name="modelName"
        placeholder="模型名称，例如 gpt-5.5"
        required
      />
      <input
        className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
        name="apiKey"
        placeholder={credential ? "留空则不更换 API Key" : "API Key"}
        required={!credential}
        type="password"
      />
      <button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" type="submit">
        {credential ? "保存更新" : "保存 API 配置"}
      </button>
    </form>
  );
}
