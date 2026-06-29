-- Enable trigram search for scalable fuzzy matching on the denormalized search text.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Game denormalized counters and searchable text.
ALTER TABLE "Game" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "favoriteCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "searchText" TEXT;

UPDATE "Game"
SET
  "likeCount" = COALESCE(likes.count, 0),
  "favoriteCount" = COALESCE(favorites.count, 0),
  "searchText" = lower(concat_ws(' ', "Game"."title", "Game"."description", array_to_string("Game"."tags", ' ')))
FROM (
  SELECT "gameId", count(*)::int AS count
  FROM "GameLike"
  GROUP BY "gameId"
) likes
FULL OUTER JOIN (
  SELECT "gameId", count(*)::int AS count
  FROM "GameFavorite"
  GROUP BY "gameId"
) favorites ON favorites."gameId" = likes."gameId"
WHERE "Game"."id" = COALESCE(likes."gameId", favorites."gameId");

UPDATE "Game"
SET "searchText" = lower(concat_ws(' ', "title", "description", array_to_string("tags", ' ')))
WHERE "searchText" IS NULL;

-- Artifact contract between generation agents.
CREATE TABLE "JobArtifact" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB,
    "storageKey" TEXT,
    "publicUrl" TEXT,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobArtifact_jobId_type_version_key" ON "JobArtifact"("jobId", "type", "version");
CREATE INDEX "JobArtifact_jobId_type_idx" ON "JobArtifact"("jobId", "type");
CREATE INDEX "JobArtifact_type_createdAt_idx" ON "JobArtifact"("type", "createdAt");
CREATE INDEX "Game_status_playCount_idx" ON "Game"("status", "playCount");
CREATE INDEX "Game_status_likeCount_idx" ON "Game"("status", "likeCount");
CREATE INDEX "Game_tags_gin_idx" ON "Game" USING GIN ("tags");
CREATE INDEX "Game_searchText_trgm_idx" ON "Game" USING GIN ("searchText" gin_trgm_ops);

ALTER TABLE "JobArtifact" ADD CONSTRAINT "JobArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
