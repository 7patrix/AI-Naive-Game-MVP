-- CreateEnum
CREATE TYPE "ApiCredentialProvider" AS ENUM ('OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "ApiCredentialSource" AS ENUM ('PLATFORM', 'USER_KEY');

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN "apiCredentialSource" "ApiCredentialSource" NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "GenerationJob" ADD COLUMN "apiCredentialId" TEXT;

-- CreateTable
CREATE TABLE "UserApiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ApiCredentialProvider" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "wireApi" TEXT NOT NULL DEFAULT 'chat',
    "encryptedApiKey" TEXT NOT NULL,
    "apiKeyLast4" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserApiCredential_userId_isEnabled_idx" ON "UserApiCredential"("userId", "isEnabled");

-- CreateIndex
CREATE INDEX "UserApiCredential_provider_idx" ON "UserApiCredential"("provider");

-- CreateIndex
CREATE INDEX "GenerationJob_apiCredentialId_idx" ON "GenerationJob"("apiCredentialId");

-- AddForeignKey
ALTER TABLE "UserApiCredential" ADD CONSTRAINT "UserApiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_apiCredentialId_fkey" FOREIGN KEY ("apiCredentialId") REFERENCES "UserApiCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
