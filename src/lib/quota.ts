import { ApiCredentialSource, GenerationJobStatus } from "@prisma/client";
import { db } from "@/lib/db";

const MAX_ACTIVE_JOBS = 2;
const DEFAULT_PLATFORM_DAILY_JOBS = 2;
const DEFAULT_PLATFORM_DAILY_COST_CENTS = 100;
const DEFAULT_USER_KEY_DAILY_JOBS = 10;

type QuotaResult = {
  ok: boolean;
  error?: string;
};

export async function checkActiveJobQuota(userId: string): Promise<QuotaResult> {
  const activeJobs = await db.generationJob.count({
    where: {
      userId,
      status: { in: [GenerationJobStatus.PENDING, GenerationJobStatus.RUNNING] }
    }
  });

  if (activeJobs >= MAX_ACTIVE_JOBS) {
    return { ok: false, error: `资源限额：最多同时运行 ${MAX_ACTIVE_JOBS} 个生成任务。` };
  }

  return { ok: true };
}

export async function checkPlatformQuota(userId: string): Promise<QuotaResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      platformDailyJobLimit: true,
      platformDailyCostLimitCents: true
    }
  });
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [jobsToday, costToday] = await Promise.all([
    db.generationJob.count({
      where: {
        userId,
        apiCredentialSource: ApiCredentialSource.PLATFORM,
        createdAt: {
          gte: since24h
        }
      }
    }),
    db.generationJob.aggregate({
      where: {
        userId,
        apiCredentialSource: ApiCredentialSource.PLATFORM,
        createdAt: {
          gte: since24h
        }
      },
      _sum: {
        estimatedCostCents: true
      }
    })
  ]);
  const dailyJobLimit = user?.platformDailyJobLimit ?? DEFAULT_PLATFORM_DAILY_JOBS;
  const dailyCostLimit = user?.platformDailyCostLimitCents ?? DEFAULT_PLATFORM_DAILY_COST_CENTS;

  if (jobsToday >= dailyJobLimit) {
    return { ok: false, error: `平台额度：每个账号 24 小时最多创建 ${dailyJobLimit} 个平台额度任务。` };
  }

  if ((costToday._sum.estimatedCostCents ?? 0) >= dailyCostLimit) {
    return { ok: false, error: `平台额度：24 小时估算成本已达到上限，请使用自己的 API 或稍后再试。` };
  }

  return { ok: true };
}

export async function checkUserKeyQuota(userId: string): Promise<QuotaResult> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const jobsToday = await db.generationJob.count({
    where: {
      userId,
      apiCredentialSource: ApiCredentialSource.USER_KEY,
      createdAt: {
        gte: since24h
      }
    }
  });

  if (jobsToday >= DEFAULT_USER_KEY_DAILY_JOBS) {
    return { ok: false, error: `自带 API：每个账号 24 小时最多创建 ${DEFAULT_USER_KEY_DAILY_JOBS} 个任务。` };
  }

  return { ok: true };
}
