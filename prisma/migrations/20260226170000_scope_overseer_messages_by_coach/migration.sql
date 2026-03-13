-- Add coach-scoping and optional context columns for overseer messages.
ALTER TABLE "OverseerMessage"
  ADD COLUMN "coachUserId" TEXT,
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "coachingSessionId" TEXT,
  ADD COLUMN "sourceAgentMessageId" TEXT;

-- Existing overseer rows are globally mixed and cannot be safely reassigned.
DELETE FROM "OverseerMessage";

ALTER TABLE "OverseerMessage"
  ALTER COLUMN "coachUserId" SET NOT NULL;

ALTER TABLE "OverseerMessage"
  ADD CONSTRAINT "OverseerMessage_coachUserId_fkey"
    FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OverseerMessage_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OverseerMessage_coachingSessionId_fkey"
    FOREIGN KEY ("coachingSessionId") REFERENCES "CoachingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "OverseerMessage_sourceAgentMessageId_fkey"
    FOREIGN KEY ("sourceAgentMessageId") REFERENCES "AgentMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OverseerMessage_coachUserId_createdAt_idx"
  ON "OverseerMessage"("coachUserId", "createdAt");

CREATE INDEX "OverseerMessage_clientId_idx"
  ON "OverseerMessage"("clientId");

CREATE INDEX "OverseerMessage_coachingSessionId_idx"
  ON "OverseerMessage"("coachingSessionId");

CREATE INDEX "OverseerMessage_sourceAgentMessageId_idx"
  ON "OverseerMessage"("sourceAgentMessageId");
