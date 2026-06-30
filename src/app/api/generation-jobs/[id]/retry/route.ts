import { NextRequest, NextResponse } from "next/server";
import { GenerationJobStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enqueueGenerationJob } from "@/lib/queue";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/create", env.APP_URL), { status: 303 });
  }

  const job = await db.generationJob.findFirst({
    where: {
      id,
      userId: user.id
    }
  });

  if (!job || job.status !== GenerationJobStatus.FAILED) {
    return NextResponse.redirect(new URL("/create?error=只能重试失败的生成任务。", env.APP_URL), {
      status: 303
    });
  }

  await db.generationJob.update({
    where: { id: job.id },
    data: {
      status: GenerationJobStatus.PENDING,
      progress: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
      logs: {
        create: {
          agentName: "System",
          step: "job_retried",
          message: "用户触发失败重试，任务重新进入等待队列。"
        }
      }
    }
  });

  await enqueueGenerationJob(job.id);

  return NextResponse.redirect(new URL(`/create?job=${job.id}`, env.APP_URL), { status: 303 });
}
