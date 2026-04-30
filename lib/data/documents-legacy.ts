import { DocumentExtractionStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Legacy schema compatibility shim
//
// This module exists to support environments where migration
// 20260227113000_add_document_chunks_and_extraction_status has not yet been
// applied. It can be deleted entirely once all deployment environments are
// confirmed to be on the extended schema.
//
// Removal checklist:
//   1. Confirm `prisma migrate deploy` has run in every environment
//   2. Delete this file
//   3. Remove all imports of this file from documents.ts and client-document-context.ts
//   4. Remove legacy early-exit and try/catch fallback branches in each CRUD function
//   5. Remove the legacy content-column fallback path in getClientDocumentContext
// ---------------------------------------------------------------------------

let supportsExtendedClientDocumentSchema: boolean | null = null;

export const LEGACY_DOCUMENT_SELECT = {
  id: true,
  originalName: true,
  displayName: true,
  storedName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  kind: true,
  audioDuration: true,
  content: true,
} satisfies Prisma.ClientDocumentSelect;

export const LEGACY_DOCUMENT_WITH_CLIENT_SELECT = {
  ...LEGACY_DOCUMENT_SELECT,
  clientId: true,
} satisfies Prisma.ClientDocumentSelect;

function inferLegacyExtractionStatus(content: string | null) {
  return content && content.trim().length > 0
    ? DocumentExtractionStatus.READY
    : DocumentExtractionStatus.PENDING;
}

export function mapLegacyDocument(document: {
  id: string;
  originalName: string;
  displayName?: string | null;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  kind: "TEXT" | "AUDIO";
  audioDuration: number | null;
  content: string | null;
}) {
  return {
    id: document.id,
    originalName: document.originalName,
    displayName: document.displayName ?? null,
    blobUrl: document.storedName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    kind: document.kind,
    audioDuration: document.audioDuration,
    createdAt: document.createdAt.toISOString(),
    content: document.content,
    extractionStatus: inferLegacyExtractionStatus(document.content),
    extractionError: null as string | null,
    extractedAt: document.content
      ? (document.createdAt.toISOString() as string | null)
      : null,
  };
}

export function mapLegacyDocumentWithClient(document: {
  id: string;
  clientId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  kind: "TEXT" | "AUDIO";
  audioDuration: number | null;
  content: string | null;
}) {
  return {
    ...mapLegacyDocument(document),
    clientId: document.clientId,
  };
}

export function isMissingDocumentContextSchemaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const message = error.message.toLowerCase();
    return (
      message.includes("does not exist") ||
      message.includes("unknown column") ||
      message.includes("unknown table")
    );
  }

  return false;
}

export function markExtendedClientDocumentSchemaSupported() {
  if (supportsExtendedClientDocumentSchema !== false) {
    supportsExtendedClientDocumentSchema = true;
  }
}

export function markExtendedClientDocumentSchemaMissing() {
  supportsExtendedClientDocumentSchema = false;
}

export function isExtendedDocumentSchemaKnownMissing() {
  return supportsExtendedClientDocumentSchema === false;
}

export function getDocumentChunkDelegate() {
  const delegate = (
    prisma as unknown as {
      documentChunk?: {
        findMany?: (...args: unknown[]) => Promise<unknown>;
      };
    }
  ).documentChunk;

  if (!delegate || typeof delegate.findMany !== "function") {
    return null;
  }

  return prisma.documentChunk;
}
