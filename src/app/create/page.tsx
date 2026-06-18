import { redirect } from "next/navigation";
import { GenerationJobStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type CreatePageProps = {
  searchParams: Promise<{
    error?: string;
    job?: string;
  }>;
};

const statusLabels: Record<GenerationJobStatus, string> = {
  PENDING: "等待处理",
  RUNNING: "生成中",
  SUCCEEDED: "已完成",
  FAILED: "失败"
};

const statusStyles: Record<GenerationJobStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  RUNNING: "bg-blue-50 text-blue-700",
  SUCCEEDED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700"
};

export const dynamic = "force-dynamic";

export default async function CreatePage({ searchParams }: CreatePageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect("/login?next=/create");
  }

  const jobs = await db.generationJob.findMany({
    where: {
      userId: user.id
    },
    include: {
      logs: {
        orderBy: {
          createdAt: "asc"
        }
      },
      uploads: {
        orderBy: {
          createdAt: "desc"
        }
      },
      game: {
        select: {
          id: true,
          slug: true,
          title: true,
          manifestUrl: true,
          bundleUrl: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 8
  });
  const shouldRefresh = jobs.some(
    (job) => job.status === GenerationJobStatus.PENDING || job.status === GenerationJobStatus.RUNNING
  );

  return (
    <div className="space-y-8">
      {shouldRefresh ? <meta httpEquiv="refresh" content="5" /> : null}
      {params.job ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          生成任务已创建：<span className="font-mono">{params.job}</span>。Worker 会异步处理它。
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          {params.error}
        </div>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          创作者工作台
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">输入创意生成小游戏</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          完整流程会创建生成任务，由后台 Worker 调用 Agent 流水线，生成游戏文件并上传到
          MinIO，最后发布成可游玩的游戏记录。
        </p>
        <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          当前登录账号：<span className="font-semibold">{user.email}</span>。这里创建的生成任务会绑定到该账号。
        </div>
        <form
          action="/api/generation-jobs"
          className="mt-6 space-y-4"
          encType="multipart/form-data"
          method="post"
        >
          <textarea
            className="min-h-40 w-full rounded-xl border border-slate-300 px-4 py-3"
            name="prompt"
            placeholder="描述一个小游戏创意，例如：做一个太空飞船躲避陨石的小游戏。"
            required
          />
          <input
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
            multiple
            name="assets"
            type="file"
          />
          <button
            className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white"
            type="submit"
          >
            创建生成任务
          </button>
        </form>
      </section>
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8">
        <h2 className="text-xl font-semibold text-slate-950">Agent 流水线</h2>
        <ol className="mt-5 space-y-4 text-sm text-slate-700">
          <li>1. Planner Agent：把用户创意整理成游戏规格说明。</li>
          <li>2. Coder Agent：根据规格生成 Web 游戏文件。</li>
          <li>3. Reviewer Agent：检查基础安全规则和产物结构。</li>
          <li>4. Publisher Agent：上传 Manifest 和游戏文件到对象存储。</li>
        </ol>
      </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              任务历史
            </p>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">最近生成任务</h2>
          </div>
          <p className="text-sm text-slate-500">
            有运行中任务时页面会每 5 秒自动刷新；失败任务可手动重试。
          </p>
        </div>

        {jobs.length > 0 ? (
          <div className="mt-6 space-y-5">
            {jobs.map((job) => (
              <article className="rounded-2xl border border-slate-200 p-5" key={job.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[job.status]}`}
                      >
                        {statusLabels[job.status]}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{job.id}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{job.prompt}</p>
                  </div>
                  <div className="text-sm font-semibold text-slate-700">{job.progress}%</div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-indigo-600" style={{ width: `${job.progress}%` }} />
                </div>

                {job.uploads.length > 0 ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">输入文件</p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {job.uploads.map((asset) => (
                        <li key={asset.id}>{asset.filename}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4 rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  <p className="font-semibold text-indigo-200">Agent 日志</p>
                  <ol className="mt-3 space-y-2">
                    {job.logs.map((log) => (
                      <li key={log.id}>
                        <span className="text-indigo-200">{log.agentName}</span>
                        <span className="text-slate-500"> / {log.step}：</span>
                        {log.message}
                      </li>
                    ))}
                  </ol>
                </div>

                {job.game ? (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-xs text-emerald-900">
                    <p className="font-semibold">发布产物</p>
                    <p className="mt-2 break-all">Manifest：{job.game.manifestUrl}</p>
                    <p className="mt-1 break-all">Bundle：{job.game.bundleUrl}</p>
                    <a
                      className="mt-3 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                      href={`/games/${job.game.slug}`}
                    >
                      查看已发布游戏：{job.game.title}
                    </a>
                  </div>
                ) : null}
                {job.status === GenerationJobStatus.FAILED ? (
                  <form action={`/api/generation-jobs/${job.id}/retry`} className="mt-4" method="post">
                    <button
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                      type="submit"
                    >
                      重试任务
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
            暂无生成任务。提交上方表单后，这里会显示任务状态和 Agent 日志。
          </div>
        )}
      </section>
    </div>
  );
}
