import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function getSecret() {
  if (env.API_KEY_ENCRYPTION_SECRET) {
    return env.API_KEY_ENCRYPTION_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("API_KEY_ENCRYPTION_SECRET is required in production.");
  }

  return "dev-api-key-encryption-secret-change-before-production";
}

function getKey() {
  return createHash("sha256").update(getSecret()).digest();
}

export function encryptApiKey(apiKey: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptApiKey(encryptedApiKey: string) {
  const [ivValue, tagValue, ciphertextValue] = encryptedApiKey.split(":");

  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted API key payload.");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function getApiKeyLast4(apiKey: string) {
  return apiKey.slice(-4);
}
