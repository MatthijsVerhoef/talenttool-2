import {
  DocumentExtractionStatus,
  Prisma,
  type ClientDocument as PrismaClientDocument,
} from "@prisma/client";

import { logInfo } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import {
  getDocumentChunkDelegate,
  isMissingDocumentContextSchemaError,
  isExtendedDocumentSchemaKnownMissing,
  LEGACY_DOCUMENT_SELECT,
  LEGACY_DOCUMENT_WITH_CLIENT_SELECT,
  mapLegacyDocument,
  mapLegacyDocumentWithClient,
  markExtendedClientDocumentSchemaSupported,
  markExtendedClientDocumentSchemaMissing,
} from "@/lib/data/documents-legacy";
import { splitDocumentIntoChunks } from "@/lib/retrieval/text-chunking";

export type DocumentKind = "TEXT" | "AUDIO";

export interface ClientDocument {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: DocumentKind;
  createdAt: string;
  audioDuration?: number | null;
  content?: string | null;
  extractionStatus: DocumentExtractionStatus;
  extractionError?: string | null;
  extractedAt?: string | null;
}

export interface ClientDocumentWithClient extends ClientDocument {
  clientId: string;
}

export interface ClientDocumentDebugRecord {
  documentId: string;
  filename: string;
  mime: string;
  size: number;
  hasExtractedText: boolean;
  extractedLength: number;
  chunkCount: number | null;
  extractionStatus: DocumentExtractionStatus;
  extractionError: string | null;
  updatedAt: string;
}

const DOCUMENT_SNIPPET_MAX_CHARS = Number(
  process.env.DOCUMENT_SNIPPET_MAX_CHARS ?? "0"
);

function mapDocument(document: {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  kind: DocumentKind;
  audioDuration: number | null;
  content: string | null;
  extractionStatus: DocumentExtractionStatus;
  extractionError: string | null;
  extractedAt: Date | null;
  clientId?: string;
}): ClientDocument {
  return {
    id: document.id,
    originalName: document.originalName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    kind: document.kind,
    audioDuration: document.audioDuration,
    createdAt: document.createdAt.toISOString(),
    content: document.content,
    extractionStatus: document.extractionStatus,
    extractionError: document.extractionError,
    extractedAt: document.extractedAt
      ? document.extractedAt.toISOString()
      : null,
  };
}

function mapDocumentWithClient(
  document: PrismaClientDocument
): ClientDocumentWithClient {
  return {
    ...mapDocument(document),
    clientId: document.clientId,
  };
}

export async function getClientDocuments(
  clientId: string,
  limit = 20
): Promise<ClientDocument[]> {
  if (isExtendedDocumentSchemaKnownMissing()) {
    const documents = await prisma.clientDocument.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: LEGACY_DOCUMENT_SELECT,
    });
    return documents.map(mapLegacyDocument);
  }

  try {
    const documents = await prisma.clientDocument.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    markExtendedClientDocumentSchemaSupported();
    return documents.map(mapDocument);
  } catch (error) {
    if (!isMissingDocumentContextSchemaError(error)) {
      throw error;
    }
    markExtendedClientDocumentSchemaMissing();

    logInfo("documents.schema_fallback", {
      op: "getClientDocuments",
      clientId,
      reason: "missing_extraction_columns_or_tables",
    });

    const documents = await prisma.clientDocument.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: LEGACY_DOCUMENT_SELECT,
    });

    return documents.map(mapLegacyDocument);
  }
}

export async function createClientDocument(input: {
  clientId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  content?: string;
  kind?: DocumentKind;
  audioDuration?: number;
  extractionStatus?: DocumentExtractionStatus;
  extractionError?: string | null;
  extractedAt?: Date | null;
}): Promise<ClientDocument> {
  const normalizedContent = input.content?.trim() || undefined;
  const extractionStatus =
    input.extractionStatus ??
    (normalizedContent
      ? DocumentExtractionStatus.READY
      : DocumentExtractionStatus.PENDING);
  const extractedAt =
    input.extractedAt ??
    (extractionStatus === DocumentExtractionStatus.READY ? new Date() : null);
  const chunks =
    extractionStatus === DocumentExtractionStatus.READY && normalizedContent
      ? splitDocumentIntoChunks(normalizedContent)
      : [];

  if (isExtendedDocumentSchemaKnownMissing()) {
    const document = await prisma.clientDocument.create({
      data: {
        clientId: input.clientId,
        originalName: input.originalName,
        storedName: input.storedName,
        mimeType: input.mimeType,
        size: input.size,
        content: normalizedContent,
        kind: input.kind ?? "TEXT",
        audioDuration:
          typeof input.audioDuration === "number" ? input.audioDuration : null,
      },
      select: LEGACY_DOCUMENT_SELECT,
    });
    return mapLegacyDocument(document);
  }

  try {
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.clientDocument.create({
        data: {
          clientId: input.clientId,
          originalName: input.originalName,
          storedName: input.storedName,
          mimeType: input.mimeType,
          size: input.size,
          content: normalizedContent,
          kind: input.kind ?? "TEXT",
          audioDuration: input.audioDuration,
          extractionStatus,
          extractionError: input.extractionError ?? null,
          extractedAt,
        },
      });

      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((text, chunkIndex) => ({
            documentId: created.id,
            clientId: created.clientId,
            chunkIndex,
            text,
          })),
        });
      }

      return created;
    });

    markExtendedClientDocumentSchemaSupported();
    return mapDocument(document);
  } catch (error) {
    if (!isMissingDocumentContextSchemaError(error)) {
      throw error;
    }
    markExtendedClientDocumentSchemaMissing();

    logInfo("documents.schema_fallback", {
      op: "createClientDocument",
      clientId: input.clientId,
      reason: "missing_extraction_columns_or_tables",
    });

    const document = await prisma.clientDocument.create({
      data: {
        clientId: input.clientId,
        originalName: input.originalName,
        storedName: input.storedName,
        mimeType: input.mimeType,
        size: input.size,
        content: normalizedContent,
        kind: input.kind ?? "TEXT",
        audioDuration:
          typeof input.audioDuration === "number" ? input.audioDuration : null,
      },
      select: LEGACY_DOCUMENT_SELECT,
    });

    return mapLegacyDocument(document);
  }
}

export async function updateClientDocumentExtraction(input: {
  documentId: string;
  clientId: string;
  content?: string;
  kind?: DocumentKind;
  audioDuration?: number | null;
  extractionStatus: DocumentExtractionStatus;
  extractionError?: string | null;
  extractedAt?: Date | null;
}): Promise<ClientDocumentWithClient | null> {
  const scopedDocument = await prisma.clientDocument.findFirst({
    where: {
      id: input.documentId,
      clientId: input.clientId,
    },
    select: { id: true },
  });
  if (!scopedDocument) {
    return null;
  }

  const normalizedContent = input.content?.trim() || undefined;
  const chunks =
    input.extractionStatus === DocumentExtractionStatus.READY &&
    normalizedContent
      ? splitDocumentIntoChunks(normalizedContent)
      : [];

  if (isExtendedDocumentSchemaKnownMissing()) {
    const updated = await prisma.clientDocument.update({
      where: { id: scopedDocument.id },
      data: {
        content: normalizedContent ?? null,
        kind: input.kind,
        audioDuration:
          typeof input.audioDuration === "number" ? input.audioDuration : null,
      },
      select: LEGACY_DOCUMENT_WITH_CLIENT_SELECT,
    });

    return mapLegacyDocumentWithClient(updated);
  }

  try {
    const document = await prisma.$transaction(async (tx) => {
      const updated = await tx.clientDocument.update({
        where: {
          id: scopedDocument.id,
        },
        data: {
          content: normalizedContent ?? null,
          kind: input.kind,
          audioDuration:
            typeof input.audioDuration === "number"
              ? input.audioDuration
              : null,
          extractionStatus: input.extractionStatus,
          extractionError: input.extractionError ?? null,
          extractedAt: input.extractedAt ?? new Date(),
        },
      });

      await tx.documentChunk.deleteMany({
        where: {
          documentId: updated.id,
        },
      });

      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((text, chunkIndex) => ({
            documentId: updated.id,
            clientId: updated.clientId,
            chunkIndex,
            text,
          })),
        });
      }

      return updated;
    });

    markExtendedClientDocumentSchemaSupported();
    return mapDocumentWithClient(document);
  } catch (error) {
    if (isMissingDocumentContextSchemaError(error)) {
      markExtendedClientDocumentSchemaMissing();
      logInfo("documents.schema_fallback", {
        op: "updateClientDocumentExtraction",
        clientId: input.clientId,
        documentId: input.documentId,
        reason: "missing_extraction_columns_or_tables",
      });

      const updated = await prisma.clientDocument.update({
        where: { id: scopedDocument.id },
        data: {
          content: normalizedContent ?? null,
          kind: input.kind,
          audioDuration:
            typeof input.audioDuration === "number" ? input.audioDuration : null,
        },
        select: LEGACY_DOCUMENT_WITH_CLIENT_SELECT,
      });

      return mapLegacyDocumentWithClient(updated);
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }
    throw error;
  }
}

export async function getClientDocumentById(
  documentId: string,
  clientId: string
): Promise<ClientDocumentWithClient | null> {
  if (isExtendedDocumentSchemaKnownMissing()) {
    const document = await prisma.clientDocument.findFirst({
      where: {
        id: documentId,
        clientId,
      },
      select: LEGACY_DOCUMENT_WITH_CLIENT_SELECT,
    });
    if (!document) {
      return null;
    }
    return mapLegacyDocumentWithClient(document);
  }

  try {
    const document = await prisma.clientDocument.findFirst({
      where: {
        id: documentId,
        clientId,
      },
    });
    if (!document) {
      return null;
    }
    markExtendedClientDocumentSchemaSupported();
    return mapDocumentWithClient(document);
  } catch (error) {
    if (!isMissingDocumentContextSchemaError(error)) {
      throw error;
    }
    markExtendedClientDocumentSchemaMissing();

    logInfo("documents.schema_fallback", {
      op: "getClientDocumentById",
      clientId,
      documentId,
      reason: "missing_extraction_columns_or_tables",
    });

    const document = await prisma.clientDocument.findFirst({
      where: {
        id: documentId,
        clientId,
      },
      select: LEGACY_DOCUMENT_WITH_CLIENT_SELECT,
    });
    if (!document) {
      return null;
    }
    return mapLegacyDocumentWithClient(document);
  }
}

export async function deleteClientDocumentById(
  documentId: string,
  clientId: string
): Promise<ClientDocumentWithClient | null> {
  const scopedDocument = await prisma.clientDocument.findFirst({
    where: {
      id: documentId,
      clientId,
    },
    select: { id: true },
  });
  if (!scopedDocument) {
    return null;
  }

  if (isExtendedDocumentSchemaKnownMissing()) {
    const document = await prisma.clientDocument.delete({
      where: { id: scopedDocument.id },
      select: LEGACY_DOCUMENT_WITH_CLIENT_SELECT,
    });
    return mapLegacyDocumentWithClient(document);
  }

  try {
    const document = await prisma.clientDocument.delete({
      where: { id: scopedDocument.id },
    });
    markExtendedClientDocumentSchemaSupported();
    return mapDocumentWithClient(document);
  } catch (error) {
    if (!isMissingDocumentContextSchemaError(error)) {
      throw error;
    }
    markExtendedClientDocumentSchemaMissing();

    logInfo("documents.schema_fallback", {
      op: "deleteClientDocumentById",
      clientId,
      documentId,
      reason: "missing_extraction_columns_or_tables",
    });

    const document = await prisma.clientDocument.delete({
      where: { id: scopedDocument.id },
      select: LEGACY_DOCUMENT_WITH_CLIENT_SELECT,
    });
    return mapLegacyDocumentWithClient(document);
  }
}

export async function getClientDocumentDebugRecords(
  clientId: string
): Promise<ClientDocumentDebugRecord[]> {
  const documents = await getClientDocuments(clientId, 200);
  const chunkCounts = new Map<string, number>();
  let chunkCountsAvailable = false;

  if (!isExtendedDocumentSchemaKnownMissing()) {
    const documentChunkDelegate = getDocumentChunkDelegate();
    if (documentChunkDelegate) {
      try {
        const rows = await documentChunkDelegate.findMany({
          where: { clientId },
          select: { documentId: true },
        });
        markExtendedClientDocumentSchemaSupported();
        chunkCountsAvailable = true;
        for (const row of rows) {
          const current = chunkCounts.get(row.documentId) ?? 0;
          chunkCounts.set(row.documentId, current + 1);
        }
      } catch (error) {
        if (!isMissingDocumentContextSchemaError(error)) {
          throw error;
        }
        markExtendedClientDocumentSchemaMissing();
        logInfo("documents.schema_fallback", {
          op: "getClientDocumentDebugRecords",
          clientId,
          reason: "missing_extraction_columns_or_tables",
        });
      }
    }
  }

  return documents.map((document) => {
    const extractedLength = document.content?.trim().length ?? 0;
    return {
      documentId: document.id,
      filename: document.originalName,
      mime: document.mimeType,
      size: document.size,
      hasExtractedText: extractedLength > 0,
      extractedLength,
      chunkCount: chunkCountsAvailable
        ? chunkCounts.get(document.id) ?? 0
        : null,
      extractionStatus: document.extractionStatus,
      extractionError: document.extractionError ?? null,
      updatedAt: document.extractedAt ?? document.createdAt,
    };
  });
}

export async function getDocumentSnippets(
  clientId: string,
  limit = 3
): Promise<string[]> {
  const documents = await prisma.clientDocument.findMany({
    where: { clientId, content: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return documents.map((doc) => {
    const body = doc.content ?? "Geen transcript beschikbaar.";
    const content =
      DOCUMENT_SNIPPET_MAX_CHARS > 0
        ? body.slice(0, DOCUMENT_SNIPPET_MAX_CHARS)
        : body;
    return `Document (${doc.kind}): ${
      doc.originalName
    }\nGeüpload op: ${doc.createdAt.toISOString()}${
      doc.kind === "AUDIO" && doc.audioDuration
        ? `\nLengte audio: ${doc.audioDuration?.toFixed(1)}s`
        : ""
    }\nInhoud:\n${content}`;
  });
}
