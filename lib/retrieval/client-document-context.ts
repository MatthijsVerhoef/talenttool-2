import { DocumentExtractionStatus, UserRole } from "@prisma/client";

import { canAccessClient, ForbiddenError } from "@/lib/authz";
import { logInfo } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import {
  getDocumentChunkDelegate,
  isMissingDocumentContextSchemaError,
  isExtendedDocumentSchemaKnownMissing,
  markExtendedClientDocumentSchemaSupported,
  markExtendedClientDocumentSchemaMissing,
} from "@/lib/data/documents-legacy";
import {
  buildQueryTerms,
  clampPositiveInt,
  countOccurrences,
  splitDocumentIntoChunks,
} from "@/lib/retrieval/text-chunking";

const DOCUMENT_CONTEXT_TOP_K = Number(
  process.env.DOCUMENT_CONTEXT_TOP_K ?? "10"
);
const DEFAULT_DOCUMENT_CONTEXT_BUDGET_CHARS = Number(
  process.env.DOCUMENT_CONTEXT_BUDGET_CHARS ?? "6000"
);

export interface DocumentContextSource {
  documentId: string;
  filename: string;
  chunkIndex: number;
}

export interface ClientDocumentContextResult {
  contextText: string;
  sources: DocumentContextSource[];
  docsConsidered: number;
  chunksConsidered: number;
  totalChars: number;
}

async function getDocumentAvailabilityStats(clientId: string): Promise<{
  docsTotalCount: number;
  docsReadyCount: number | null;
  docsWithContentCount: number;
}> {
  const docsTotalCount = await prisma.clientDocument.count({
    where: { clientId },
  });
  const docsWithContentCount = await prisma.clientDocument.count({
    where: {
      clientId,
      content: {
        not: null,
      },
    },
  });

  if (isExtendedDocumentSchemaKnownMissing()) {
    return {
      docsTotalCount,
      docsReadyCount: null,
      docsWithContentCount,
    };
  }

  try {
    const docsReadyCount = await prisma.clientDocument.count({
      where: {
        clientId,
        extractionStatus: DocumentExtractionStatus.READY,
      },
    });
    markExtendedClientDocumentSchemaSupported();
    return {
      docsTotalCount,
      docsReadyCount,
      docsWithContentCount,
    };
  } catch (error) {
    if (!isMissingDocumentContextSchemaError(error)) {
      throw error;
    }
    markExtendedClientDocumentSchemaMissing();
    return {
      docsTotalCount,
      docsReadyCount: null,
      docsWithContentCount,
    };
  }
}

export async function getClientDocumentContext(options: {
  userId: string;
  role: UserRole | string;
  clientId: string;
  queryText: string;
  budgetChars: number;
  requestId?: string;
}): Promise<ClientDocumentContextResult> {
  const hasAccess = await canAccessClient(
    { id: options.userId, role: options.role },
    options.clientId
  );
  if (!hasAccess) {
    throw new ForbiddenError(
      "Geen toegang tot documentcontext voor deze Coachee."
    );
  }

  const budgetChars = clampPositiveInt(
    options.budgetChars,
    DEFAULT_DOCUMENT_CONTEXT_BUDGET_CHARS
  );
  if (budgetChars <= 0) {
    return {
      contextText: "",
      sources: [],
      docsConsidered: 0,
      chunksConsidered: 0,
      totalChars: 0,
    };
  }
  const availability = await getDocumentAvailabilityStats(options.clientId);
  const queryTerms = buildQueryTerms(options.queryText);
  logInfo("doc_context.query", {
    requestId: options.requestId ?? null,
    userId: options.userId,
    clientId: options.clientId,
    queryLength: options.queryText.length,
    queryTermCount: queryTerms.length,
    queryTerms: queryTerms.slice(0, 12),
    budgetChars,
    docsTotalCount: availability.docsTotalCount,
    docsReadyCount: availability.docsReadyCount,
    docsWithContentCount: availability.docsWithContentCount,
  });

  type CandidateChunk = {
    text: string;
    chunkIndex: number;
    documentId: string;
    document: {
      id: string;
      originalName: string;
      createdAt: Date;
    };
  };

  let chunks: CandidateChunk[] = [];

  try {
    if (isExtendedDocumentSchemaKnownMissing()) {
      throw new Error("DOCUMENT_CONTEXT_SCHEMA_MISSING");
    }

    const documentChunkDelegate = getDocumentChunkDelegate();
    if (!documentChunkDelegate) {
      throw new Error("DOCUMENT_CHUNK_DELEGATE_MISSING");
    }

    const storedChunks = await documentChunkDelegate.findMany({
      where: {
        clientId: options.clientId,
        document: {
          extractionStatus: DocumentExtractionStatus.READY,
        },
      },
      include: {
        document: {
          select: {
            id: true,
            originalName: true,
            createdAt: true,
          },
        },
      },
    });
    markExtendedClientDocumentSchemaSupported();

    chunks = storedChunks.map((chunk) => ({
      text: chunk.text,
      chunkIndex: chunk.chunkIndex,
      documentId: chunk.documentId,
      document: {
        id: chunk.document.id,
        originalName: chunk.document.originalName,
        createdAt: chunk.document.createdAt,
      },
    }));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "DOCUMENT_CHUNK_DELEGATE_MISSING"
    ) {
      logInfo("doc_context.fallback", {
        requestId: options.requestId ?? null,
        userId: options.userId,
        clientId: options.clientId,
        reason: "document_chunk_delegate_missing",
      });
    }
    if (
      error instanceof Error &&
      error.message === "DOCUMENT_CONTEXT_SCHEMA_MISSING"
    ) {
      logInfo("doc_context.fallback", {
        requestId: options.requestId ?? null,
        userId: options.userId,
        clientId: options.clientId,
        reason: "document_context_schema_marked_missing",
      });
    }

    if (!isMissingDocumentContextSchemaError(error)) {
      if (
        !(
          error instanceof Error &&
          (error.message === "DOCUMENT_CHUNK_DELEGATE_MISSING" ||
            error.message === "DOCUMENT_CONTEXT_SCHEMA_MISSING")
        )
      ) {
        throw error;
      }
    }

    if (
      !(
        error instanceof Error &&
        error.message === "DOCUMENT_CHUNK_DELEGATE_MISSING"
      ) &&
      !(
        error instanceof Error &&
        error.message === "DOCUMENT_CONTEXT_SCHEMA_MISSING"
      )
    ) {
      markExtendedClientDocumentSchemaMissing();
      logInfo("doc_context.fallback", {
        requestId: options.requestId ?? null,
        userId: options.userId,
        clientId: options.clientId,
        reason: "document_chunk_schema_missing",
      });
    }

    const documents = await prisma.clientDocument.findMany({
      where: {
        clientId: options.clientId,
        content: {
          not: null,
        },
      },
      select: {
        id: true,
        originalName: true,
        createdAt: true,
        content: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
    });

    chunks = documents.flatMap((document) => {
      const content = document.content?.trim();
      if (!content) {
        return [];
      }

      return splitDocumentIntoChunks(content).map((text, chunkIndex) => ({
        text,
        chunkIndex,
        documentId: document.id,
        document: {
          id: document.id,
          originalName: document.originalName,
          createdAt: document.createdAt,
        },
      }));
    });
  }

  if (chunks.length === 0) {
    logInfo("doc_context.selected", {
      requestId: options.requestId ?? null,
      userId: options.userId,
      clientId: options.clientId,
      docsTotalCount: availability.docsTotalCount,
      docsReadyCount: availability.docsReadyCount,
      docsWithContentCount: availability.docsWithContentCount,
      docsCount: 0,
      chunkCount: 0,
      selectedChunkCount: 0,
      totalChars: 0,
      documentIds: [],
    });
    return {
      contextText: "",
      sources: [],
      docsConsidered: 0,
      chunksConsidered: 0,
      totalChars: 0,
    };
  }

  const ranked = chunks
    .map((chunk) => {
      const lower = chunk.text.toLowerCase();
      const overlapScore =
        queryTerms.length === 0
          ? 0
          : queryTerms.reduce(
              (total, term) => total + countOccurrences(lower, term),
              0
            );
      const recencyScore = chunk.document.createdAt.getTime() / 1e11;
      const score =
        overlapScore * 1000 + recencyScore - chunk.chunkIndex / 10000;
      return {
        score,
        chunk,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (
        b.chunk.document.createdAt.getTime() !==
        a.chunk.document.createdAt.getTime()
      ) {
        return (
          b.chunk.document.createdAt.getTime() -
          a.chunk.document.createdAt.getTime()
        );
      }
      if (a.chunk.chunkIndex !== b.chunk.chunkIndex) {
        return a.chunk.chunkIndex - b.chunk.chunkIndex;
      }
      return a.chunk.documentId.localeCompare(b.chunk.documentId);
    });

  const topK = clampPositiveInt(DOCUMENT_CONTEXT_TOP_K, 10);
  const selectedSources: DocumentContextSource[] = [];
  const selectedChunks: string[] = [];
  let totalChars = 0;
  for (const entry of ranked) {
    if (selectedChunks.length >= topK) {
      break;
    }

    const chunkLabel = `[Document: ${
      entry.chunk.document.originalName
    } | chunk ${entry.chunk.chunkIndex + 1}]`;
    const formatted = `${chunkLabel}\n${entry.chunk.text}`.trim();
    const nextTotal =
      totalChars + formatted.length + (selectedChunks.length > 0 ? 6 : 0);
    if (nextTotal > budgetChars) {
      continue;
    }

    selectedChunks.push(formatted);
    selectedSources.push({
      documentId: entry.chunk.document.id,
      filename: entry.chunk.document.originalName,
      chunkIndex: entry.chunk.chunkIndex,
    });
    totalChars = nextTotal;
  }

  const contextText = selectedChunks.join("\n\n---\n\n").trim();
  const docsConsidered = Array.from(
    new Set(chunks.map((chunk) => chunk.document.id))
  ).length;
  const documentIds = Array.from(
    new Set(selectedSources.map((source) => source.documentId))
  );
  const filenames = Array.from(
    new Set(selectedSources.map((source) => source.filename))
  );
  logInfo("doc_context.selected", {
    requestId: options.requestId ?? null,
    userId: options.userId,
    clientId: options.clientId,
    queryLength: options.queryText.length,
    queryTermCount: queryTerms.length,
    docsTotalCount: availability.docsTotalCount,
    docsReadyCount: availability.docsReadyCount,
    docsWithContentCount: availability.docsWithContentCount,
    docsCount: docsConsidered,
    chunkCount: chunks.length,
    selectedChunkCount: selectedSources.length,
    totalChars: contextText.length,
    documentIds,
    filenames: filenames.slice(0, 12),
  });

  return {
    contextText,
    sources: selectedSources,
    docsConsidered,
    chunksConsidered: chunks.length,
    totalChars: contextText.length,
  };
}
