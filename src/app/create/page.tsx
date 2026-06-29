import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateWorkspace } from "./CreateWorkspace";
import type { CreateJob } from "./types";

type CreatePageProps = {
  searchParams: Promise<{
    error?: string;
    job?: string;
    remixGameId?: string;
  }>;
};

export const dynamic = "force-dynamic";

function serializeJob(job: Awaited<ReturnType<typeof getJobs>>[number]): CreateJob {
  return {
    id: job.id,
    prompt: job.prompt,
    status: job.status,
    progress: job.progress,
    error: job.error,
    moderationStatus: job.moderationStatus,
    estimatedCostCents: job.estimatedCostCents,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    parentGame: job.parentGame,
    game: job.game,
    logs: job.logs.map((log) => ({
      id: log.id,
      agentName: log.agentName,
      step: log.step,
      message: log.message,
      createdAt: log.createdAt.toISOString()
    })),
    uploads: job.uploads.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      publicUrl: asset.publicUrl
    })),
    artifacts: job.artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      version: artifact.version,
      publicUrl: artifact.publicUrl,
      createdAt: artifact.createdAt.toISOString()
    }))
  };
}

async function getJobs(userId: string) {
  return db.generationJob.findMany({
    where: {
      userId
    },
    include: {
      logs: {
        orderBy: {
          createdAt: "asc"
        }
      },
      uploads: {
        orderBy: {
          createdAt: "desc"
        }
      },
      artifacts: {
        orderBy: {
          createdAt: "asc"
        }
      },
      parentGame: {
        select: {
          id: true,
          slug: true,
          title: true,
          currentVersionNumber: true
        }
      },
      game: {
        select: {
          id: true,
          slug: true,
          title: true,
          manifestUrl: true,
          bundleUrl: true,
          currentVersionNumber: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 8
  });
}

export default async function CreatePage({ searchParams }: CreatePageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect("/login?next=/create");
  }

  if (!user.emailVerifiedAt) {
    redirect(`/verify-email?email=${encodeURIComponent(user.email)}`);
  }

  const remixSource = params.remixGameId
    ? await db.game.findFirst({
        where: {
          id: params.remixGameId,
          status: "PUBLISHED"
        },
        select: {
          id: true,
          title: true,
          description: true,
          currentVersionNumber: true
        }
      })
    : null;

  const jobs = await getJobs(user.id);

  return (
    <CreateWorkspace
      error={params.error ?? null}
      initialJobs={jobs.map(serializeJob)}
      remixSource={remixSource}
      selectedJobId={params.job ?? null}
      userEmail={user.email}
    />
  );
}
