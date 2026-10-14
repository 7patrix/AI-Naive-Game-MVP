BEGIN;
CREATE TYPE "GameRuntime" AS ENUM ('HTML', 'GODOT_WEB');
CREATE TYPE "PlannedPlayMode" AS ENUM ('SINGLE_PLAYER', 'MULTIPLAYER', 'BOTH');
CREATE TYPE "BuildStatus" AS ENUM ('DRAFT', 'PUBLISHED');
ALTER TABLE "Game" ADD COLUMN "runtime" "GameRuntime" NOT NULL DEFAULT 'HTML', ADD COLUMN "plannedPlayMode" "PlannedPlayMode" NOT NULL DEFAULT 'SINGLE_PLAYER';
ALTER TABLE "GameVersion" ADD COLUMN "buildStatus" "BuildStatus" NOT NULL DEFAULT 'PUBLISHED', ADD COLUMN "buildFiles" JSONB, ADD COLUMN "engineVersion" TEXT;
CREATE TABLE "BuildPreviewSession" (
  "id" TEXT NOT NULL, "versionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "bootstrapExpiresAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "activatedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuildPreviewSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BuildPreviewSession_tokenHash_key" ON "BuildPreviewSession"("tokenHash");
CREATE INDEX "BuildPreviewSession_expiresAt_idx" ON "BuildPreviewSession"("expiresAt");
CREATE INDEX "BuildPreviewSession_userId_versionId_idx" ON "BuildPreviewSession"("userId", "versionId");
ALTER TABLE "BuildPreviewSession" ADD CONSTRAINT "BuildPreviewSession_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "GameVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
