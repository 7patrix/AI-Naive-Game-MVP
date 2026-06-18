import { NextRequest, NextResponse } from "next/server";
import { UploadedAssetKind } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadObject } from "@/lib/storage";

export const runtime = "nodejs";

const createJobSchema = z.object({
  prompt: z.string().trim().min(10, "请至少输入 10 个字符的游戏创意。").max(2000)
});

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

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/create", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const parsed = createJobSchema.safeParse({
    prompt: formData.get("prompt")
  });

  if (!parsed.success) {
    return redirectWithError(request, parsed.error.issues[0]?.message ?? "请输入有效的游戏创意。");
  }

  const job = await db.generationJob.create({
    data: {
      prompt: parsed.data.prompt,
      userId: user.id,
      logs: {
        create: {
          agentName: "System",
          step: "job_created",
          message: "生成任务已创建，等待 Worker 处理。"
        }
      }
    }
  });

  const files = formData
    .getAll("assets")
    .filter((value): value is File => value instanceof File && value.size > 0);

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
