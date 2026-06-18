import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnvFile() {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    process.env[key] ??= value;
  }
}

loadLocalEnvFile();

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_COOKIE_NAME: z.string().default("ai_arcade_session"),
  AUTH_SECRET: z.string().min(16).default("dev-secret-change-before-production"),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_INTERNAL_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().default("minioadmin"),
  S3_SECRET_ACCESS_KEY: z.string().default("minioadmin"),
  S3_BUCKET: z.string().default("ai-arcade"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  S3_PUBLIC_BASE_URL: z.string().url().default("http://localhost:9000/ai-arcade"),
  OPENAI_API_KEY: z.string().optional(),
  MODEL_NAME: z.string().default("gpt-5.5")
});

export const env = envSchema.parse(process.env);
