"use client";

import type { CreateJob } from "./types";

type JobTimelineProps = {
  job: CreateJob;
  compact?: boolean;
};

const statusLabels: Record<CreateJob["status"], string> = {
  PENDING: "等待处理",
  RUNNING: "生成中",
  SUCCEEDED: "已完成",
  FAILED: "失败"
};

const statusStyles: Record<CreateJob["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700",
  RUNNING: "bg-blue-50 text-blue-700",
  SUCCEEDED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700"
};

export function JobTimeline({ job, compact = false }: JobTimelineProps) {
  const latestLogs = compact ? job.logs.slice(-5) : job.logs;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[job.status]}`}>
              {statusLabels[job.status]}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                job.moderationStatus === "REJECTED" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"
              }`}
            >
              审核：{job.moderationStatus}
            </span>
            <span className="font-mono text-xs text-slate-500">{job.id}</span>
          </div>
          {!compact ? <p className="mt-3 text-sm leading-6 text-slate-700">{job.prompt}</p> : null}
          {job.parentGame ? (
            <p className="mt-2 text-xs text-violet-700">
              Remix 来源：{job.parentGame.title} v{job.parentGame.currentVersionNumber}
            </p>
          ) : null}
        </div>
        <div className="text-right text-sm font-semibold text-slate-700">
          <p>{job.progress}%</p>
          <p className="mt-1 text-xs font-normal text-slate-500">
            估算成本：{(job.estimatedCostCents / 100).toFixed(2)} USD
          </p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-indigo-600 transition-all" style={{ width: `${job.progress}%` }} />
      </div>

      {job.uploads.length > 0 && !compact ? (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-500">输入文件</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {job.uploads.map((asset) => (
              <li key={asset.id}>{asset.filename}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
        <p className="font-semibold text-indigo-200">Agent 日志</p>
        {latestLogs.length > 0 ? (
          <ol className="mt-3 space-y-2">
            {latestLogs.map((log) => (
              <li key={log.id}>
                <span className="text-indigo-200">{log.agentName}</span>
                <span className="text-slate-500"> / {log.step}：</span>
                {log.message}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-slate-400">等待 Worker 写入日志。</p>
        )}
      </div>
    </div>
  );
}
