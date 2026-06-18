-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "parentGameId" TEXT,
ADD COLUMN "sourceVersionId" TEXT;

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "moderationReport" JSONB,
ADD COLUMN "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "modelInputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "modelOutputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "parentGameId" TEXT,
ADD COLUMN "remixSourceVersionId" TEXT;

-- CreateTable
CREATE TABLE "GameVersion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "manifestUrl" TEXT NOT NULL,
    "bundleUrl" TEXT NOT NULL,
    "coverUrl" TEXT,
    "storagePrefix" TEXT NOT NULL,
    "jobId" TEXT,
    "changeSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameVersion_pkey" PRIMARY KEY ("id")
);

-- Backfill one version row for games that already have published artifacts.
INSERT INTO "GameVersion" (
    "id",
    "gameId",
    "versionNumber",
    "title",
    "description",
    "manifestUrl",
    "bundleUrl",
    "coverUrl",
    "storagePrefix",
    "jobId",
    "changeSummary",
    "createdAt"
)
SELECT
    'ver_' || "id",
    "id",
    1,
    "title",
    "description",
    COALESCE("manifestUrl", ''),
    COALESCE("bundleUrl", ''),
    "coverUrl",
    COALESCE("storagePrefix", 'legacy/' || "slug"),
    "createdByJobId",
    'Initial published version',
    COALESCE("publishedAt", "createdAt")
FROM "Game"
WHERE "manifestUrl" IS NOT NULL AND "bundleUrl" IS NOT NULL
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE INDEX "Game_parentGameId_idx" ON "Game"("parentGameId");

-- CreateIndex
CREATE INDEX "GenerationJob_parentGameId_idx" ON "GenerationJob"("parentGameId");

-- CreateIndex
CREATE INDEX "GameVersion_jobId_idx" ON "GameVersion"("jobId");

-- CreateIndex
CREATE INDEX "GameVersion_createdAt_idx" ON "GameVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameVersion_gameId_versionNumber_key" ON "GameVersion"("gameId", "versionNumber");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_parentGameId_fkey" FOREIGN KEY ("parentGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "GameVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_parentGameId_fkey" FOREIGN KEY ("parentGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_remixSourceVersionId_fkey" FOREIGN KEY ("remixSourceVersionId") REFERENCES "GameVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVersion" ADD CONSTRAINT "GameVersion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVersion" ADD CONSTRAINT "GameVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
