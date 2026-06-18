import { NextRequest, NextResponse } from "next/server";
import { GameStatus, GenerationJobStatus, ModerationStatus, UploadedAssetKind } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadObject } from "@/lib/storage";

export const runtime = "nodejs";

const createJobSchema = z.object({
  prompt: z.string().trim().min(10, "请至少输入 10 个字符的游戏创意。").max(2000),
  remixGameId: z.string().trim().min(1).optional()
});

const MAX_DAILY_JOBS = 10;
const MAX_ACTIVE_JOBS = 2;
const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
const BLOCKED_TERMS = ["赌博", "色情", "仇恨", "自残", "诈骗", "暴恐", "恶意软件"];

function getAssetKind(contentType: string) {
  if (contentType.startsWith("image/")) return UploadedAssetKind.IMAGE;
  if (contentType.startsWith("video/")) return UploadedAssetKind.VIDEO;
  if (contentType.startsWith("audio/")) return UploadedAssetKind.AUDIO;
  if (contentType.includes("pdf") || contentType.includes("text")) return UploadedAssetKind.DOCUMENT;
  return UploadedAssetKind.OTHER;
}

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/create", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

function moderatePrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  const blockedTerms = BLOCKED_TERMS.filter((term) => normalized.includes(term));

  return {
    status: blockedTerms.length > 0 ? ModerationStatus.REJECTED : ModerationStatus.APPROVED,
    blockedTerms,
    rules: {
      maxPromptLength: 2000,
      blockedTermCount: BLOCKED_TERMS.length
    },
    checkedAt: new Date().toISOString()
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/create", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const parsed = createJobSchema.safeParse({
    prompt: formData.get("prompt"),
    remixGameId: formData.get("remixGameId") || undefined
  });

  if (!parsed.success) {
    return redirectWithError(request, parsed.error.issues[0]?.message ?? "请输入有效的游戏创意。");
  }

  const activeJobs = await db.generationJob.count({
    where: {
      userId: user.id,
      status: { in: [GenerationJobStatus.PENDING, GenerationJobStatus.RUNNING] }
    }
  });

  if (activeJobs >= MAX_ACTIVE_JOBS) {
    return redirectWithError(request, `资源限额：最多同时运行 ${MAX_ACTIVE_JOBS} 个生成任务。`);
  }

  const jobsToday = await db.generationJob.count({
    where: {
      userId: user.id,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });

  if (jobsToday >= MAX_DAILY_JOBS) {
    return redirectWithError(request, `资源限额：每个账号 24 小时最多创建 ${MAX_DAILY_JOBS} 个任务。`);
  }

  const files = formData
    .getAll("assets")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const totalFileBytes = files.reduce((total, file) => total + file.size, 0);

  if (files.length > MAX_FILES) {
    return redirectWithError(request, `资源限额：最多上传 ${MAX_FILES} 个文件。`);
  }

  if (files.some((file) => file.size > MAX_FILE_SIZE_BYTES)) {
    return redirectWithError(request, "资源限额：单个文件不能超过 10MB。");
  }

  if (totalFileBytes > MAX_TOTAL_FILE_BYTES) {
    return redirectWithError(request, "资源限额：单次上传总大小不能超过 25MB。");
  }

  const sourceGame = parsed.data.remixGameId
    ? await db.game.findFirst({
        where: {
          id: parsed.data.remixGameId,
          status: GameStatus.PUBLISHED
        },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1
          }
        }
      })
    : null;

  if (parsed.data.remixGameId && !sourceGame) {
    return redirectWithError(request, "无法 Remix：源游戏不存在或尚未发布。");
  }

  const moderationReport = moderatePrompt(parsed.data.prompt);
  const isRejected = moderationReport.status === ModerationStatus.REJECTED;
  const job = await db.generationJob.create({
    data: {
      prompt: parsed.data.prompt,
      userId: user.id,
      status: isRejected ? GenerationJobStatus.FAILED : GenerationJobStatus.PENDING,
      progress: isRejected ? 100 : 0,
      error: isRejected ? "内容审核未通过，请调整创意描述后重试。" : null,
      moderationStatus: moderationReport.status,
      moderationReport,
      parentGameId: sourceGame?.id,
      remixSourceVersionId: sourceGame?.versions[0]?.id,
      finishedAt: isRejected ? new Date() : null,
      logs: {
        create: [
          {
            agentName: "System",
            step: "job_created",
            message: sourceGame
              ? `Remix 任务已创建，源游戏：${sourceGame.title}。`
              : "生成任务已创建，等待 Worker 处理。"
          },
          {
            agentName: "ModerationAgent",
            step: isRejected ? "content_rejected" : "content_approved",
            message: isRejected
              ? "轻量内容审核未通过，任务不会进入 Worker 队列。"
              : "轻量内容审核已通过。",
            metadata: moderationReport
          }
        ]
      }
    }
  });

  if (isRejected) {
    const url = new URL("/create", request.url);
    url.searchParams.set("job", job.id);
    return NextResponse.redirect(url, { status: 303 });
  }

  const uploadedAssets = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const storageKey = `uploads/${user.id}/${job.id}/${Date.now()}-${file.name}`;
    const uploaded = await uploadObject({
      key: storageKey,
      body: Buffer.from(bytes),
      contentType: file.type || "application/octet-stream"
    });

    const asset = await db.uploadedAsset.create({
      data: {
        ownerId: user.id,
        jobId: job.id,
        kind: getAssetKind(file.type),
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        storageKey: uploaded.key,
        publicUrl: uploaded.url
      }
    });

    uploadedAssets.push({
      id: asset.id,
      filename: asset.filename,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      publicUrl: asset.publicUrl
    });
  }

  if (uploadedAssets.length > 0) {
    await db.generationJob.update({
      where: { id: job.id },
      data: {
        inputFiles: uploadedAssets
      }
    });

    await db.agentLog.create({
      data: {
        jobId: job.id,
        agentName: "UploadAgent",
        step: "assets_uploaded",
        message: `已上传 ${uploadedAssets.length} 个输入文件到对象存储。`,
        metadata: uploadedAssets
      }
    });
  }

  const url = new URL("/create", request.url);
  url.searchParams.set("job", job.id);
  return NextResponse.redirect(url, { status: 303 });
}
