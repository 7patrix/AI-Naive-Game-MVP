import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getGenerationQueue } from "@/lib/queue";

type AdminJobRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

async function removeQueuedJob(jobId: string) {
  try {
    const queue = getGenerationQueue();
    const queuedJobs = await queue.getJobs(["waiting", "delayed", "prioritized", "paused"], 0, 100);
    const matches = queuedJobs.filter((job) => job.data.jobId === jobId);

    await Promise.all(matches.map((job) => job.remove()));

    return matches.length;
  } catch (error) {
    console.warn("Failed to remove BullMQ job while deleting generation job", error);
    return 0;
  }
}

export async function POST(request: NextRequest, { params }: AdminJobRouteProps) {
  const admin = await requireAdminUser();

  if (!admin) {
    return NextResponse.redirect(new URL("/login?next=/admin", env.APP_URL), { status: 303 });
  }

  const { id } = await params;
  const job = await db.generationJob.findUnique({
    where: { id },
    select: {
      id: true,
      prompt: true,
      status: true,
      progress: true,
      userId: true,
      game: {
        select: {
          id: true
        }
      }
    }
  });

  if (!job) {
    return NextResponse.redirect(new URL("/admin?error=job-not-found", env.APP_URL), { status: 303 });
  }

  if (job.game) {
    return NextResponse.redirect(new URL("/admin?error=job-has-game", env.APP_URL), { status: 303 });
  }

  const removedQueueJobs = await removeQueuedJob(job.id);

  await db.$transaction([
    db.generationJob.delete({
      where: { id: job.id }
    }),
    db.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "GENERATION_JOB_DELETED",
        targetId: job.id,
        metadata: {
          prompt: job.prompt,
          status: job.status,
          progress: job.progress,
          userId: job.userId,
          removedQueueJobs
        }
      }
    })
  ]);

  return NextResponse.redirect(new URL("/admin", env.APP_URL), { status: 303 });
}
