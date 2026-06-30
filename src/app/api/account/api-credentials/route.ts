import { NextRequest, NextResponse } from "next/server";
import { ApiCredentialProvider } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { encryptApiKey, getApiKeyLast4 } from "@/lib/api-credential-crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const credentialSchema = z.object({
  credentialId: z.string().trim().optional(),
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().url(),
  modelName: z.string().trim().min(1).max(120),
  wireApi: z.enum(["chat", "responses"]),
  apiKey: z.string().trim().optional()
});

function redirectToApiKeys(search?: string) {
  return NextResponse.redirect(new URL(`/account/api-keys${search ?? ""}`, env.APP_URL), { status: 303 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/account/api-keys", env.APP_URL), { status: 303 });
  }

  const formData = await request.formData();
  const parsed = credentialSchema.safeParse({
    credentialId: formData.get("credentialId") || undefined,
    name: formData.get("name"),
    baseUrl: formData.get("baseUrl"),
    modelName: formData.get("modelName"),
    wireApi: formData.get("wireApi"),
    apiKey: formData.get("apiKey") || undefined
  });

  if (!parsed.success) {
    return redirectToApiKeys("?error=invalid");
  }

  const apiKey = parsed.data.apiKey?.trim();

  try {
    if (parsed.data.credentialId) {
      const existing = await db.userApiCredential.findFirst({
        where: {
          id: parsed.data.credentialId,
          userId: user.id
        }
      });

      if (!existing) {
        return redirectToApiKeys("?error=not_found");
      }

      await db.userApiCredential.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          baseUrl: parsed.data.baseUrl,
          modelName: parsed.data.modelName,
          wireApi: parsed.data.wireApi,
          ...(apiKey
            ? {
                encryptedApiKey: encryptApiKey(apiKey),
                apiKeyLast4: getApiKeyLast4(apiKey)
              }
            : {})
        }
      });

      return redirectToApiKeys("?saved=1");
    }

    if (!apiKey) {
      return redirectToApiKeys("?error=invalid");
    }

    await db.userApiCredential.create({
      data: {
        userId: user.id,
        provider: ApiCredentialProvider.OPENAI_COMPATIBLE,
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl,
        modelName: parsed.data.modelName,
        wireApi: parsed.data.wireApi,
        encryptedApiKey: encryptApiKey(apiKey),
        apiKeyLast4: getApiKeyLast4(apiKey)
      }
    });

    return redirectToApiKeys("?saved=1");
  } catch (error) {
    if (error instanceof Error && error.message.includes("API_KEY_ENCRYPTION_SECRET")) {
      return redirectToApiKeys("?error=encryption_missing");
    }

    console.error("Failed to save API credential", error);
    return redirectToApiKeys("?error=invalid");
  }
}
