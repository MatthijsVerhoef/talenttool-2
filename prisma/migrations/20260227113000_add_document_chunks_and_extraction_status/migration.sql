CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

ALTER TABLE "ClientDocument"
  ADD COLUMN "extractionStatus" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "extractionError" TEXT,
  ADD COLUMN "extractedAt" TIMESTAMP(3);

CREATE TABLE "DocumentChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key"
  ON "DocumentChunk"("documentId", "chunkIndex");

CREATE INDEX "DocumentChunk_clientId_createdAt_idx"
  ON "DocumentChunk"("clientId", "createdAt");

CREATE INDEX "DocumentChunk_documentId_idx"
  ON "DocumentChunk"("documentId");

ALTER TABLE "DocumentChunk"
  ADD CONSTRAINT "DocumentChunk_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "ClientDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentChunk"
  ADD CONSTRAINT "DocumentChunk_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
