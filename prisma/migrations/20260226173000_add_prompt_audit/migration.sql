CREATE TABLE "PromptAudit" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT NOT NULL,
  "promptKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "oldHash" TEXT,
  "newHash" TEXT,
  "oldLength" INTEGER,
  "newLength" INTEGER,
  "requestId" TEXT,
  "ip" TEXT,

  CONSTRAINT "PromptAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptAudit_promptKey_createdAt_idx"
  ON "PromptAudit"("promptKey", "createdAt");

CREATE INDEX "PromptAudit_actorUserId_createdAt_idx"
  ON "PromptAudit"("actorUserId", "createdAt");

ALTER TABLE "PromptAudit"
  ADD CONSTRAINT "PromptAudit_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
