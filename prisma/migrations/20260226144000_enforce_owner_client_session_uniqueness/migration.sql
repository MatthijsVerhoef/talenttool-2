DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CoachingSession"
    WHERE "ownerUserId" IS NULL
  ) THEN
    RAISE EXCEPTION 'CoachingSession.ownerUserId still contains NULL values. Run scripts/dedupe-coaching-sessions.ts first.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "ownerUserId", "clientId", COUNT(*) AS duplicate_count
      FROM "CoachingSession"
      GROUP BY "ownerUserId", "clientId"
      HAVING COUNT(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate CoachingSession rows found for (ownerUserId, clientId). Run scripts/dedupe-coaching-sessions.ts first.';
  END IF;
END
$$;

ALTER TABLE "CoachingSession"
ALTER COLUMN "ownerUserId" SET NOT NULL;

CREATE UNIQUE INDEX "CoachingSession_ownerUserId_clientId_key"
ON "CoachingSession"("ownerUserId", "clientId");

DROP INDEX IF EXISTS "CoachingSession_clientId_idx";
