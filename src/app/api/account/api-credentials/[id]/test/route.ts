import { NextRequest, NextResponse } from "next/server";
import { ApiCredentialTestStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { decryptApiKey } from "@/lib/api-credential-crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { testModelConfig } from "@/lib/model-client";

type TestApiCredentialRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function redirectToApiKeys(search: string) {
  return NextResponse.redirect(new URL(`/account/api-keys${search}`, env.APP_URL), { status: 303 });
}

export async function POST(_request: NextRequest, { params }: TestApiCredentialRouteProps) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/account/api-keys", env.APP_URL), { status: 303 });
  }

  const { id } = await params;
  const credential = await db.userApiCredential.findFirst({
    where: {
      id,
      userId: user.id
    }
  });

  if (!credential) {
    return redirectToApiKeys("?error=not_found");
  }

  try {
    await testModelConfig({
      apiKey: decryptApiKey(credential.encryptedApiKey),
      baseUrl: credential.baseUrl,
      modelName: credential.modelName,
      wireApi: credential.wireApi === "responses" ? "responses" : "chat"
    });

    await db.userApiCredential.update({
      where: { id: credential.id },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: ApiCredentialTestStatus.SUCCEEDED,
        lastTestError: null
      }
    });

    return redirectToApiKeys("?tested=success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";

    await db.userApiCredential.update({
      where: { id: credential.id },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: ApiCredentialTestStatus.FAILED,
        lastTestError: message.slice(0, 500)
      }
    });

    return redirectToApiKeys("?tested=failed");
  }
}
