import { NextRequest, NextResponse } from "next/server";
import { GameReportStatus } from "@prisma/client";
import { requireAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

type AdminReportRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: AdminReportRouteProps) {
  const admin = await requireAdminUser();

  if (!admin) {
    return NextResponse.redirect(new URL("/login?next=/admin", env.APP_URL), { status: 303 });
  }

  const { id } = await params;
  const formData = await request.formData();
  const status = formData.get("status");

  if (status !== GameReportStatus.RESOLVED && status !== GameReportStatus.DISMISSED) {
    return NextResponse.redirect(new URL("/admin?error=invalid-report-status", env.APP_URL), { status: 303 });
  }

  const report = await db.gameReport.update({
    where: { id },
    data: {
      status,
      resolverId: admin.id,
      resolvedAt: new Date()
    },
    include: {
      game: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  await db.adminAuditLog.create({
    data: {
      adminId: admin.id,
      action: status === GameReportStatus.RESOLVED ? "REPORT_RESOLVED" : "REPORT_DISMISSED",
      targetId: report.id,
      metadata: {
        gameId: report.game.id,
        gameTitle: report.game.title,
        reason: report.reason
      }
    }
  });

  return NextResponse.redirect(new URL("/admin", env.APP_URL), { status: 303 });
}
