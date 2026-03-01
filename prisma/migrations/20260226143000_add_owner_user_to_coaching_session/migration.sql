ALTER TABLE "CoachingSession"
ADD COLUMN "ownerUserId" TEXT;

UPDATE "CoachingSession" AS cs
SET "ownerUserId" = c."coachId"
FROM "Client" AS c
WHERE cs."clientId" = c."id"
  AND cs."ownerUserId" IS NULL
  AND c."coachId" IS NOT NULL;

WITH fallback AS (
  SELECT COALESCE(
    (
      SELECT "id"
      FROM "User"
      WHERE "role" = 'ADMIN'
      ORDER BY "createdAt" ASC
      LIMIT 1
    ),
    (
      SELECT "id"
      FROM "User"
      ORDER BY "createdAt" ASC
      LIMIT 1
    )
  ) AS "id"
)
UPDATE "CoachingSession" AS cs
SET "ownerUserId" = fallback."id"
FROM fallback
WHERE cs."ownerUserId" IS NULL
  AND fallback."id" IS NOT NULL;

ALTER TABLE "CoachingSession"
ADD CONSTRAINT "CoachingSession_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CoachingSession_clientId_ownerUserId_idx"
ON "CoachingSession"("clientId", "ownerUserId");
