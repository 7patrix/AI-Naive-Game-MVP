import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiCredentialSource, GameReportStatus, GameStatus, GenerationJobStatus } from "@prisma/client";
import { requireAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getGenerationQueueCounts } from "@/lib/queue";

export const dynamic = "force-dynamic";

const gameStatusLabels: Record<GameStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已下架"
};

const jobStatusLabels: Record<GenerationJobStatus, string> = {
  PENDING: "等待",
  RUNNING: "运行中",
  SUCCEEDED: "成功",
  FAILED: "失败"
};

const reportStatusLabels: Record<GameReportStatus, string> = {
  OPEN: "待处理",
  RESOLVED: "已处理",
  DISMISSED: "已驳回"
};

export default async function AdminPage() {
  const admin = await requireAdminUser();

  if (!admin) {
    redirect("/login?next=/admin");
  }

  const [games, reports, jobs, audits, usageJobs, counts] = await Promise.all([
    db.game.findMany({
      include: {
        author: { select: { email: true, name: true } },
        _count: { select: { reports: true, events: true, likes: true, favorites: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    db.gameReport.findMany({
      include: {
        game: { select: { title: true, slug: true, status: true } },
        reporter: { select: { email: true, name: true } },
        resolver: { select: { email: true, name: true } }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20
    }),
    db.generationJob.findMany({
      include: {
        user: { select: { email: true, name: true } },
        game: { select: { title: true, slug: true } },
        apiCredential: { select: { name: true, apiKeyLast4: true } },
        logs: { orderBy: { createdAt: "desc" }, take: 3 }
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    db.adminAuditLog.findMany({
      include: { admin: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    db.generationJob.findMany({
      select: {
        userId: true,
        apiCredentialSource: true,
        estimatedCostCents: true,
        user: { select: { email: true, name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    Promise.all([
      db.game.count({ where: { status: GameStatus.PUBLISHED } }),
      db.game.count({ where: { status: GameStatus.ARCHIVED } }),
      db.gameReport.count({ where: { status: GameReportStatus.OPEN } }),
      db.generationJob.count({ where: { status: GenerationJobStatus.FAILED } })
    ])
  ]);
  const [publishedCount, archivedCount, openReportCount, failedJobCount] = counts;
  const stuckCutoff = new Date(Date.now() - env.GENERATION_JOB_TIMEOUT_MS);
  const [queueCounts, jobStatusGroups, stuckJobCount] = await Promise.all([
    getGenerationQueueCounts(),
    db.generationJob.groupBy({
      by: ["status"],
      _count: { status: true }
    }),
    db.generationJob.count({
      where: {
        status: GenerationJobStatus.RUNNING,
        startedAt: { lt: stuckCutoff }
      }
    })
  ]);
  const jobStatusCounts = jobStatusGroups.reduce(
    (acc, group) => {
      acc[group.status] = group._count.status;
      return acc;
    },
    {} as Partial<Record<GenerationJobStatus, number>>
  );
  const usageByUser = Array.from(
    usageJobs.reduce((map, job) => {
      const current = map.get(job.userId) ?? {
        userLabel: job.user.name ?? job.user.email,
        platformJobs: 0,
        userKeyJobs: 0,
        estimatedCostCents: 0
      };

      if (job.apiCredentialSource === ApiCredentialSource.USER_KEY) {
        current.userKeyJobs += 1;
      } else {
        current.platformJobs += 1;
      }

      current.estimatedCostCents += job.estimatedCostCents;
      map.set(job.userId, current);
      return map;
    }, new Map<string, { userLabel: string; platformJobs: number; userKeyJobs: number; estimatedCostCents: number }>())
  )
    .map(([userId, usage]) => ({ userId, ...usage }))
    .sort((left, right) => right.estimatedCostCents - left.estimatedCostCents)
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 p-8 text-white shadow-2xl shadow-slate-200/70">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-red-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <p className="relative text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">
          平台维护者
        </p>
        <div className="relative mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-bold">管理后台</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              用于演示平台维护者如何查看内容、处理举报、下架不当游戏，并追踪生成任务和审计记录。
            </p>
          </div>
          <p className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white backdrop-blur">
            当前管理员：{admin.email}
          </p>
        </div>
        <div className="relative mt-6 grid gap-4 md:grid-cols-4">
          <MetricCard label="已发布游戏" value={publishedCount} />
          <MetricCard label="已下架游戏" value={archivedCount} />
          <MetricCard label="待处理举报" value={openReportCount} />
          <MetricCard label="失败任务" value={failedJobCount} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">队列状态</h2>
            <p className="mt-2 text-sm text-slate-600">
              监控生成队列和任务健康度。卡住任务数大于 0 时需要检查 Worker 是否正常。
            </p>
          </div>
          {stuckJobCount > 0 ? (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              卡住任务：{stuckJobCount}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              运行正常
            </span>
          )}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <QueueMetric label="等待处理" value={jobStatusCounts.PENDING ?? 0} />
          <QueueMetric label="运行中" value={jobStatusCounts.RUNNING ?? 0} />
          <QueueMetric label="已完成" value={jobStatusCounts.SUCCEEDED ?? 0} />
          <QueueMetric label="失败" value={jobStatusCounts.FAILED ?? 0} />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          {queueCounts ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <QueueBadge label="waiting" value={queueCounts.waiting} />
              <QueueBadge label="active" value={queueCounts.active} />
              <QueueBadge label="delayed" value={queueCounts.delayed} />
              <QueueBadge label="failed" value={queueCounts.failed} />
              <QueueBadge label="completed" value={queueCounts.completed} />
              <QueueBadge label="paused" value={queueCounts.paused} />
            </div>
          ) : (
            <p className="text-red-600">队列状态读取失败，请检查 Redis 连接。</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-950">内容治理</h2>
        <p className="mt-2 text-sm text-slate-600">
          下架后游戏将不再公开展示，管理员仍可在后台追踪和恢复。
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 py-3">游戏</th>
                <th className="border-b border-slate-200 py-3">作者</th>
                <th className="border-b border-slate-200 py-3">状态</th>
                <th className="border-b border-slate-200 py-3">数据</th>
                <th className="border-b border-slate-200 py-3">更新时间</th>
                <th className="border-b border-slate-200 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr key={game.id}>
                  <td className="border-b border-slate-100 py-4">
                    <div className="font-semibold text-slate-950">{game.title}</div>
                    <div className="mt-1 break-all font-mono text-xs text-slate-500">{game.manifestUrl}</div>
                  </td>
                  <td className="border-b border-slate-100 py-4">
                    {game.author.name ?? game.author.email}
                  </td>
                  <td className="border-b border-slate-100 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {gameStatusLabels[game.status]}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 py-4 text-xs text-slate-600">
                    {game.playCount} 次游玩 / {game._count.likes} 赞 / {game._count.favorites} 收藏 /
                    {game._count.reports} 举报
                  </td>
                  <td className="border-b border-slate-100 py-4 text-xs text-slate-500">
                    {game.updatedAt.toLocaleString("zh-CN")}
                  </td>
                  <td className="border-b border-slate-100 py-4">
                    <div className="flex flex-wrap gap-2">
                      {game.status === GameStatus.PUBLISHED ? (
                        <AdminStatusForm gameId={game.id} status="ARCHIVED" label="下架" tone="danger" />
                      ) : (
                        <AdminStatusForm gameId={game.id} status="PUBLISHED" label="恢复发布" tone="primary" />
                      )}
                      <Link className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" href={`/play/${game.id}`}>
                        预览
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-950">举报处理</h2>
          <div className="mt-5 space-y-4">
            {reports.length > 0 ? (
              reports.map((report) => (
                <article className="rounded-2xl border border-slate-200 p-4" key={report.id}>
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          {reportStatusLabels[report.status]}
                        </span>
                        <Link className="font-semibold text-indigo-700" href={`/games/${report.game.slug}`}>
                          {report.game.title}
                        </Link>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">原因：{report.reason}</p>
                      {report.details ? <p className="mt-1 text-xs text-slate-500">{report.details}</p> : null}
                      <p className="mt-2 text-xs text-slate-500">
                        举报人：{report.reporter?.name ?? report.reporter?.email ?? "匿名"} / {report.createdAt.toLocaleString("zh-CN")}
                      </p>
                      {report.resolver ? (
                        <p className="mt-1 text-xs text-slate-500">
                          处理人：{report.resolver.name ?? report.resolver.email}
                        </p>
                      ) : null}
                    </div>
                    {report.status === GameReportStatus.OPEN ? (
                      <div className="flex gap-2">
                        <ReportActionForm reportId={report.id} action="RESOLVED" label="标记已处理" />
                        <ReportActionForm reportId={report.id} action="DISMISSED" label="驳回" />
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">暂无举报。</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-950">最近生成任务</h2>
          <div className="mt-5 space-y-4">
            {jobs.map((job) => (
              <article className="rounded-2xl border border-slate-200 p-4" key={job.id}>
                <div className="flex justify-between gap-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {jobStatusLabels[job.status]}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{job.progress}%</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-slate-700">{job.prompt}</p>
                <p className="mt-2 text-xs text-slate-500">
                  用户：{job.user.name ?? job.user.email} / 成本估算：{(job.estimatedCostCents / 100).toFixed(2)} USD
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  额度来源：
                  {job.apiCredentialSource === "USER_KEY"
                    ? `用户自带 API（${job.apiCredentialNameSnapshot ?? job.apiCredential?.name ?? "已删除配置"} / ${job.apiCredentialModelSnapshot ?? "未知模型"}${job.apiCredential ? ` / ****${job.apiCredential.apiKeyLast4}` : ""}）`
                    : "平台额度"}
                </p>
                {job.error ? <p className="mt-1 line-clamp-2 text-xs text-red-600">错误：{job.error}</p> : null}
                {job.game ? (
                  <Link className="mt-2 inline-flex text-xs font-semibold text-indigo-700" href={`/games/${job.game.slug}`}>
                    查看产物：{job.game.title}
                  </Link>
                ) : null}
                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                  {job.logs.map((log) => (
                    <li key={log.id}>
                      {log.agentName} / {log.step}：{log.message}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {job.game ? (
                    <p className="text-xs text-slate-400">已生成游戏的任务会保留为作品记录。</p>
                  ) : (
                    <DeleteJobForm jobId={job.id} />
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-950">用户用量概览</h2>
        <p className="mt-2 text-sm text-slate-600">
          最近 200 个任务的来源和估算成本，用于观察平台额度消耗和自带 API 使用情况。
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 py-3">用户</th>
                <th className="border-b border-slate-200 py-3">平台额度任务</th>
                <th className="border-b border-slate-200 py-3">自带 API 任务</th>
                <th className="border-b border-slate-200 py-3">估算成本</th>
              </tr>
            </thead>
            <tbody>
              {usageByUser.map((usage) => (
                <tr key={usage.userId}>
                  <td className="border-b border-slate-100 py-4 font-medium text-slate-900">{usage.userLabel}</td>
                  <td className="border-b border-slate-100 py-4 text-slate-600">{usage.platformJobs}</td>
                  <td className="border-b border-slate-100 py-4 text-slate-600">{usage.userKeyJobs}</td>
                  <td className="border-b border-slate-100 py-4 text-slate-600">
                    {(usage.estimatedCostCents / 100).toFixed(2)} USD
                  </td>
                </tr>
              ))}
              {usageByUser.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={4}>暂无用量记录。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-950">审计日志</h2>
        <div className="mt-5 space-y-3 text-sm">
          {audits.length > 0 ? (
            audits.map((audit) => (
              <div className="rounded-2xl bg-slate-50 p-4" key={audit.id}>
                <div className="flex flex-col justify-between gap-2 md:flex-row">
                  <span className="font-semibold text-slate-900">{audit.action}</span>
                  <span className="text-xs text-slate-500">{audit.createdAt.toLocaleString("zh-CN")}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  管理员：{audit.admin.name ?? audit.admin.email} / 目标：{audit.targetId ?? "-"}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">暂无审计记录。</p>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-5 text-white backdrop-blur">
      <p className="text-sm text-slate-300">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function QueueBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
      <span className="font-mono text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function AdminStatusForm({
  gameId,
  status,
  label,
  tone
}: {
  gameId: string;
  status: "PUBLISHED" | "ARCHIVED";
  label: string;
  tone: "primary" | "danger";
}) {
  return (
    <form action={`/api/admin/games/${gameId}/status`} method="post">
      <input name="status" type="hidden" value={status} />
      <button
        className={`rounded-lg px-3 py-2 text-xs font-semibold ${
          tone === "danger" ? "bg-red-600 text-white" : "bg-indigo-600 text-white"
        }`}
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}

function ReportActionForm({
  reportId,
  action,
  label
}: {
  reportId: string;
  action: "RESOLVED" | "DISMISSED";
  label: string;
}) {
  return (
    <form action={`/api/admin/reports/${reportId}`} method="post">
      <input name="status" type="hidden" value={action} />
      <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" type="submit">
        {label}
      </button>
    </form>
  );
}

function DeleteJobForm({ jobId }: { jobId: string }) {
  return (
    <form action={`/api/admin/jobs/${jobId}`} method="post">
      <button
        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
        type="submit"
      >
        删除任务
      </button>
    </form>
  );
}
