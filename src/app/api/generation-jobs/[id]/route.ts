import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await db.generationJob.findFirst({
    where: {
      id,
      userId: user.id
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
    }
  });

  if (!job) {
    return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
