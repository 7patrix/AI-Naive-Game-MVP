"use client";

import Link from "next/link";
import { PlayFrame } from "@/components/PlayFrame";
import { JobTimeline } from "./JobTimeline";
import type { CreateJob } from "./types";

type CreatePreviewPanelProps = {
  job: CreateJob | null;
};

export function CreatePreviewPanel({ job }: CreatePreviewPanelProps) {
  if (!job) {
    return (
      <aside className="sticky top-6 rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-sm text-slate-600 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">实时预览</p>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">等待创作任务</h2>
        <p className="mt-3 leading-6">
          提交 prompt 后，右侧会持续读取任务状态。Worker 发布出 `bundleUrl` 后，可以直接在这里打开 iframe 预览。
        </p>
      </aside>
    );
  }

  const isRunning = job.status === "PENDING" || job.status === "RUNNING";
  const canPreview = Boolean(job.game?.bundleUrl);

  return (
    <aside className="sticky top-6 space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">实时预览</p>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">
          {job.game?.title ?? (isRunning ? "Agent 正在生成" : "任务状态")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isRunning
            ? "左侧可以继续查看历史，右侧会自动轮询当前任务。"
            : job.status === "FAILED"
              ? "任务失败后可以保留上下文直接重试。"
              : "发布完成后，预览会直接加载对象存储中的远端 HTML。"}
        </p>
      </section>

      {canPreview && job.game ? (
        <PlayFrame
          compact
          entryUrl={job.game.bundleUrl ?? ""}
          gameId={job.game.id}
          height={420}
          manifestUrl={job.game.manifestUrl}
          permissions={["keyboard", "pointer"]}
          reportTelemetry={false}
          title={job.game.title}
        />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <JobTimeline compact job={job} />
        </section>
      )}

      {job.status === "FAILED" ? (
        <form action={`/api/generation-jobs/${job.id}/retry`} method="post">
          <button className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white" type="submit">
            重试任务
          </button>
        </form>
      ) : null}

      {job.game ? (
        <Link
          className="block rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-semibold text-white"
          href={`/games/${job.game.slug}`}
        >
          查看详情：{job.game.title}
        </Link>
      ) : null}
    </aside>
  );
}
