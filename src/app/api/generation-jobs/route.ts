import { NextRequest, NextResponse } from "next/server";
import { ApiCredentialSource, ApiCredentialTestStatus, GameStatus, GenerationJobStatus, ModerationStatus, UploadedAssetKind } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enqueueGenerationJob } from "@/lib/queue";
import { checkActiveJobQuota, checkPlatformQuota, checkUserKeyQuota } from "@/lib/quota";
import { uploadObject } from "@/lib/storage";

export const runtime = "nodejs";

const createJobSchema = z.object({
  prompt: z.string().trim().min(10, "请至少输入 10 个字符的游戏创意。").max(2000),
  remixGameId: z.string().trim().min(1).optional(),
  apiCredentialId: z.string().trim().min(1).optional()
});

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
const DUPLICATE_SUBMIT_WINDOW_MS = 30 * 1000;
const BLOCKED_TERMS = ["赌博", "色情", "仇恨", "自残", "诈骗", "暴恐", "恶意软件"];

function getAssetKind(contentType: string) {
  if (contentType.startsWith("image/")) return UploadedAssetKind.IMAGE;
  if (contentType.startsWith("video/")) return UploadedAssetKind.VIDEO;
  if (contentType.startsWith("audio/")) return UploadedAssetKind.AUDIO;
  if (contentType.includes("pdf") || contentType.includes("text")) return UploadedAssetKind.DOCUMENT;
  return UploadedAssetKind.OTHER;
}

function getSafeUploadKey(userId: string, jobId: string, file: File, index: number) {
  const extension = file.name.match(/\.([a-zA-Z0-9]{1,12})$/)?.[1]?.toLowerCase();
  const suffix = extension ? `.${extension}` : "";
  return `uploads/${userId}/${jobId}/${Date.now()}-${index}${suffix}`;
}

function redirectWithError(error: string) {
  const url = new URL("/create", env.APP_URL);
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
    return NextResponse.redirect(new URL("/login?next=/create", env.APP_URL), { status: 303 });
  }

  if (!user.emailVerifiedAt) {
    const url = new URL("/verify-email", env.APP_URL);
    url.searchParams.set("email", user.email);
    return NextResponse.redirect(url, { status: 303 });
  }

  const formData = await request.formData();
  const parsed = createJobSchema.safeParse({
    prompt: formData.get("prompt"),
    remixGameId: formData.get("remixGameId") || undefined,
    apiCredentialId: formData.get("apiCredentialId") || undefined
  });

  if (!parsed.success) {
    return redirectWithError(parsed.error.issues[0]?.message ?? "请输入有效的游戏创意。");
  }

  const activeQuota = await checkActiveJobQuota(user.id);

  if (!activeQuota.ok) {
    return redirectWithError(activeQuota.error ?? "当前生成任务过多，请稍后再试。");
  }

  const files = formData
    .getAll("assets")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const totalFileBytes = files.reduce((total, file) => total + file.size, 0);

  if (files.length > MAX_FILES) {
    return redirectWithError(`资源限额：最多上传 ${MAX_FILES} 个文件。`);
  }

  if (files.some((file) => file.size > MAX_FILE_SIZE_BYTES)) {
    return redirectWithError("资源限额：单个文件不能超过 10MB。");
  }

  if (totalFileBytes > MAX_TOTAL_FILE_BYTES) {
    return redirectWithError("资源限额：单次上传总大小不能超过 25MB。");
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
    return redirectWithError("无法 Remix：源游戏不存在或尚未发布。");
  }

  const moderationReport = moderatePrompt(parsed.data.prompt);
  const isRejected = moderationReport.status === ModerationStatus.REJECTED;
  const requestedCredentialId =
    parsed.data.apiCredentialId && parsed.data.apiCredentialId !== "platform"
      ? parsed.data.apiCredentialId
      : null;
  const apiCredential = requestedCredentialId
    ? await db.userApiCredential.findFirst({
        where: {
          id: requestedCredentialId,
          userId: user.id,
          isEnabled: true,
          lastTestStatus: ApiCredentialTestStatus.SUCCEEDED
        },
        select: {
          id: true,
          name: true,
          modelName: true
        }
      })
    : null;

  if (requestedCredentialId && !apiCredential) {
    return redirectWithError("这条 API 配置不可用，请先在 API 管理中测试成功后再使用。");
  }
  const source = apiCredential ? ApiCredentialSource.USER_KEY : ApiCredentialSource.PLATFORM;
  const quota = source === ApiCredentialSource.USER_KEY
    ? await checkUserKeyQuota(user.id)
    : await checkPlatformQuota(user.id);

  if (!quota.ok) {
    return redirectWithError(quota.error ?? "当前额度不足，请稍后再试。");
  }

  const recentJobs = await db.generationJob.findMany({
    where: {
      userId: user.id,
      prompt: parsed.data.prompt,
      parentGameId: sourceGame?.id ?? null,
      apiCredentialSource: source,
      apiCredentialId: apiCredential?.id ?? null,
      createdAt: {
        gte: new Date(Date.now() - DUPLICATE_SUBMIT_WINDOW_MS)
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      inputFiles: true
    },
    take: 5
  });
  const recentDuplicate = recentJobs.find((job) => {
    const inputFileCount = Array.isArray(job.inputFiles) ? job.inputFiles.length : 0;
    return inputFileCount === files.length;
  });

  if (recentDuplicate) {
    const url = new URL("/create", env.APP_URL);
    url.searchParams.set("job", recentDuplicate.id);
    url.searchParams.set("error", "检测到重复提交，已切换到刚创建的任务。");
    return NextResponse.redirect(url, { status: 303 });
  }

  const job = await db.generationJob.create({
    data: {
      prompt: parsed.data.prompt,
      userId: user.id,
      apiCredentialSource: source,
      apiCredentialId: apiCredential?.id,
      apiCredentialNameSnapshot: apiCredential?.name,
      apiCredentialModelSnapshot: apiCredential?.modelName,
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
    const url = new URL("/create", env.APP_URL);
    url.searchParams.set("job", job.id);
    return NextResponse.redirect(url, { status: 303 });
  }

  const uploadedAssets = [];

  try {
    for (const [index, file] of files.entries()) {
      const bytes = await file.arrayBuffer();
      const storageKey = getSafeUploadKey(user.id, job.id, file, index);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传素材失败。";

    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: GenerationJobStatus.FAILED,
        progress: 100,
        error: "素材上传失败，请重命名文件或稍后重试。",
        finishedAt: new Date(),
        logs: {
          create: {
            agentName: "UploadAgent",
            step: "assets_upload_failed",
            message,
          }
        }
      }
    });

    const url = new URL("/create", env.APP_URL);
    url.searchParams.set("job", job.id);
    url.searchParams.set("error", "素材上传失败，请重命名文件或稍后重试。");
    return NextResponse.redirect(url, { status: 303 });
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

  await enqueueGenerationJob(job.id);

  const url = new URL("/create", env.APP_URL);
  url.searchParams.set("job", job.id);
  return NextResponse.redirect(url, { status: 303 });
}
