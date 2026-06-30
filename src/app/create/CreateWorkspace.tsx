"use client";

import { useEffect, useMemo, useState } from "react";
import { CreatePreviewPanel } from "./CreatePreviewPanel";
import { JobTimeline } from "./JobTimeline";
import type { CreateJob } from "./types";

type RemixSource = {
  id: string;
  title: string;
  description: string;
  currentVersionNumber: number;
} | null;
type ApiCredentialOption = {
  id: string;
  name: string;
  modelName: string;
  apiKeyLast4: string;
};

type CreateWorkspaceProps = {
  userEmail: string;
  initialJobs: CreateJob[];
  selectedJobId: string | null;
  error: string | null;
  remixSource: RemixSource;
  apiCredentials: ApiCredentialOption[];
};

function isActiveJob(job: CreateJob) {
  return job.status === "PENDING" || job.status === "RUNNING";
}

export function CreateWorkspace({
  userEmail,
  initialJobs,
  selectedJobId,
  error,
  remixSource,
  apiCredentials
}: CreateWorkspaceProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState(
    selectedJobId ?? initialJobs.find(isActiveJob)?.id ?? initialJobs[0]?.id ?? null
  );

  const activeJob = useMemo(() => jobs.find((job) => job.id === activeJobId) ?? null, [activeJobId, jobs]);

  useEffect(() => {
    if (!activeJob || !isActiveJob(activeJob)) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/generation-jobs/${activeJob.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { job: CreateJob };

        setJobs((currentJobs) => {
          const existingIndex = currentJobs.findIndex((job) => job.id === data.job.id);
          if (existingIndex === -1) return [data.job, ...currentJobs];
          const nextJobs = [...currentJobs];
          nextJobs[existingIndex] = data.job;
          return nextJobs;
        });
      } catch {
        // Polling is best effort; the next interval or page navigation can recover.
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [activeJob]);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
      <div className="space-y-8">
        {selectedJobId ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
            创作已开始：<span className="font-mono">{selectedJobId}</span>。完成后会在右侧显示预览。
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">创作者工作台</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-950">输入创意生成小游戏</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            写下你想玩的规则、角色和风格，也可以上传图片或素材。生成完成后，可以立即试玩并继续调整。
          </p>
          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            当前登录账号：<span className="font-semibold">{userEmail}</span>。这里创建的生成任务会绑定到该账号。
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            你可以为本次生成选择平台额度，或使用自己在 API 管理里测试通过的 API 配置。
          </div>
          {remixSource ? (
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
              正在 Remix：<span className="font-semibold">{remixSource.title}</span> v
              {remixSource.currentVersionNumber}。提交后会基于原作品生成新的版本。
            </div>
          ) : null}
          <form
            action="/api/generation-jobs"
            className="mt-6 space-y-4"
            encType="multipart/form-data"
            method="post"
            onSubmit={() => setIsSubmitting(true)}
          >
            {remixSource ? <input name="remixGameId" type="hidden" value={remixSource.id} /> : null}
            <label className="block text-sm font-semibold text-slate-700">
              本次使用额度
              <select className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" name="apiCredentialId">
                <option value="platform">平台额度</option>
                {apiCredentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.name} / {credential.modelName} / ****{credential.apiKeyLast4}
                  </option>
                ))}
              </select>
            </label>
            {apiCredentials.length === 0 ? (
              <p className="text-xs text-slate-500">
                暂无可用的自带 API。你可以继续使用平台额度，或前往 API 管理添加并测试自己的配置。
              </p>
            ) : null}
            <textarea
              className="min-h-40 w-full rounded-xl border border-slate-300 px-4 py-3"
              defaultValue={
                remixSource
                  ? `Remix《${remixSource.title}》：保留核心玩法，但加入新的关卡目标、视觉反馈和节奏变化。源游戏简介：${remixSource.description}`
                  : undefined
              }
              name="prompt"
              placeholder="描述一个小游戏创意，例如：做一个太空飞船躲避陨石的小游戏。"
              required
            />
            <input className="w-full rounded-xl border border-slate-300 px-4 py-3" multiple name="assets" type="file" />
            <button
              className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "正在提交..." : "创建生成任务"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">创作记录</p>
              <h2 className="mt-3 text-2xl font-bold text-slate-950">最近作品进度</h2>
            </div>
            <p className="text-sm text-slate-500">点击任一记录可切换右侧预览。</p>
          </div>

          {jobs.length > 0 ? (
            <div className="mt-6 space-y-5">
              {jobs.map((job) => (
                <article
                  className={`rounded-2xl border p-5 text-left transition ${
                    job.id === activeJobId ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200 bg-white"
                  }`}
                  key={job.id}
                  onClick={() => setActiveJobId(job.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveJobId(job.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <JobTimeline job={job} />
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
              暂无创作记录。提交上方表单后，这里会显示生成进度。
            </div>
          )}
        </section>
      </div>

      <CreatePreviewPanel job={activeJob} />
    </div>
  );
}
