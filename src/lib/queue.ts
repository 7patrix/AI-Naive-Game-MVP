import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const GENERATION_QUEUE_NAME = "generation";
export const GENERATION_JOB_NAME = "generate-game";

export type GenerationQueuePayload = {
  jobId: string;
};

export function createRedisConnection() {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null
  });
}

export function createBullMqConnectionOptions(): ConnectionOptions {
  const redisUrl = new URL(env.REDIS_URL);

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    tls: redisUrl.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  };
}

let generationQueue: Queue<GenerationQueuePayload, void, typeof GENERATION_JOB_NAME> | null = null;

export function getGenerationQueue() {
  generationQueue ??= new Queue<GenerationQueuePayload, void, typeof GENERATION_JOB_NAME>(GENERATION_QUEUE_NAME, {
    connection: createBullMqConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  });

  return generationQueue as Queue<GenerationQueuePayload, void, typeof GENERATION_JOB_NAME>;
}

export async function enqueueGenerationJob(jobId: string) {
  return getGenerationQueue().add(
    GENERATION_JOB_NAME,
    { jobId },
    {
      jobId: `${jobId}-${Date.now()}`
    }
  );
}

export type GenerationQueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
};

export async function getGenerationQueueCounts(): Promise<GenerationQueueCounts | null> {
  try {
    const counts = await getGenerationQueue().getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed",
      "paused"
    );

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
      paused: counts.paused ?? 0
    };
  } catch (error) {
    console.error("Failed to read generation queue counts", error);
    return null;
  }
}
