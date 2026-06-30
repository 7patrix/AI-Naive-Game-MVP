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
          提交创意后，这里会显示生成进度。作品完成后，可以直接在这里试玩。
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
          {job.game?.title ?? (isRunning ? "正在生成作品" : "生成状态")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isRunning
            ? "左侧可以继续查看历史，右侧会自动轮询当前任务。"
            : job.status === "FAILED"
              ? "任务失败后可以保留上下文直接重试。"
              : "作品完成后，可以在这里立即试玩。"}
        </p>
      </section>

      {canPreview && job.game ? (
        <PlayFrame
          compact
          entryUrl={`/api/games/${job.game.id}/bundle`}
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
