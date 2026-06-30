-- CreateEnum
CREATE TYPE "ApiCredentialTestStatus" AS ENUM ('UNTESTED', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "platformDailyJobLimit" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "User" ADD COLUMN "platformDailyCostLimitCents" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "UserApiCredential" ADD COLUMN "lastTestedAt" TIMESTAMP(3);
ALTER TABLE "UserApiCredential" ADD COLUMN "lastTestStatus" "ApiCredentialTestStatus" NOT NULL DEFAULT 'UNTESTED';
ALTER TABLE "UserApiCredential" ADD COLUMN "lastTestError" TEXT;

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN "apiCredentialNameSnapshot" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "apiCredentialModelSnapshot" TEXT;
