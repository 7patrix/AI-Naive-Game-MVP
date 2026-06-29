import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRedisConnection } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, "ok" | "error"> = {
    database: "ok",
    redis: "ok"
  };

  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    checks.database = "error";
  }

  const redis = createRedisConnection();
  try {
    await redis.ping();
  } catch {
    checks.redis = "error";
  } finally {
    redis.disconnect();
  }

  const healthy = Object.values(checks).every((status) => status === "ok");

  return NextResponse.json(
    {
      status: healthy ? "ok" : "error",
      checks,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    },
    {
      status: healthy ? 200 : 503
    }
  );
}
