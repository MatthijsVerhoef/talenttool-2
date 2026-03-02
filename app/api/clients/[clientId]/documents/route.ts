import { NextResponse } from "next/server";
import { DocumentExtractionStatus } from "@prisma/client";

import { uploadToBlob } from "@/lib/blob";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import {
  createClientDocument,
  getClientDocuments,
  updateClientDocumentExtraction,
} from "@/lib/data/store";
import { extractDocumentContent } from "@/lib/documents/extract";
import { getRequestId, logError, logInfo } from "@/lib/observability";
import { auth } from "@/lib/auth";

interface Params {
  params: Promise<{
    clientId: string;
  }>;
}

function jsonWithRequestId(
  requestId: string,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function queueDocumentExtraction(options: {
  requestId: string;
  route: string;
  userId: string;
  clientId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  buffer: Buffer;
}) {
  void (async () => {
    const extractionRequestId = `${options.requestId}:extract:${options.documentId}`;
    const startedAt = Date.now();

    logInfo("documents.extract.start", {
      requestId: extractionRequestId,
      route: options.route,
      userId: options.userId,
      clientId: options.clientId,
      documentId: options.documentId,
      filename: options.fileName,
      mimeType: options.mimeType,
      bytes: options.bytes,
    });

    try {
      const extraction = await extractDocumentContent({
        buffer: options.buffer,
        fileName: options.fileName,
        mimeType: options.mimeType,
        requestId: extractionRequestId,
      });

      const updated = await updateClientDocumentExtraction({
        documentId: options.documentId,
        clientId: options.clientId,
        content: extraction.content,
        kind: extraction.kind,
        audioDuration:
          typeof extraction.audioDuration === "number"
            ? extraction.audioDuration
            : null,
        extractionStatus: extraction.extractionStatus,
        extractionError: extraction.extractionError ?? null,
        extractedAt: extraction.extractedAt ?? new Date(),
      });

      logInfo("documents.extract.end", {
        requestId: extractionRequestId,
        route: options.route,
        userId: options.userId,
        clientId: options.clientId,
        documentId: options.documentId,
        status: updated ? 200 : 404,
        extractionStatus: extraction.extractionStatus,
        extractionError: extraction.extractionError ?? null,
        extractedChars: extraction.content?.length ?? 0,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const extractionError =
        error instanceof Error ? error.message : "Extractie mislukt.";
      logError("documents.extract.error", {
        requestId: extractionRequestId,
        route: options.route,
        userId: options.userId,
        clientId: options.clientId,
        documentId: options.documentId,
        durationMs: Date.now() - startedAt,
        errorMessage: extractionError,
      });

      await updateClientDocumentExtraction({
        documentId: options.documentId,
        clientId: options.clientId,
        extractionStatus: DocumentExtractionStatus.FAILED,
        extractionError,
        extractedAt: new Date(),
      }).catch(() => null);
    }
  })();
}

export async function GET(request: Request, { params }: Params) {
  const requestId = getRequestId(request);
  const route = "/api/clients/[clientId]/documents";
  const startedAt = Date.now();
  const cookie = request.headers.get("cookie") ?? "";
  const session = await auth.api.getSession({
    headers: { cookie },
  });

  if (!session) {
    return jsonWithRequestId(
      requestId,
      { error: "Niet geautoriseerd" },
      { status: 401 },
    );
  }

  const { clientId } = await params;
  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      { route: "/api/clients/[clientId]/documents", clientId },
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonWithRequestId(requestId, { error: error.message }, { status: 403 });
    }
    throw error;
  }

  const documents = await getClientDocuments(clientId);
  const extractionStatusCounts = documents.reduce<Record<string, number>>(
    (acc, document) => {
      const key = document.extractionStatus ?? "UNKNOWN";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const docsWithNonEmptyContentCount = documents.filter(
    (document) => Boolean(document.content?.trim()),
  ).length;
  logInfo("documents.list.end", {
    requestId,
    route,
    userId: session.user.id,
    clientId,
    status: 200,
    durationMs: Date.now() - startedAt,
    documentsCount: documents.length,
    docsWithNonEmptyContentCount,
    extractionStatusCounts,
  });
  return jsonWithRequestId(requestId, { documents });
}

export async function POST(request: Request, { params }: Params) {
  const requestId = getRequestId(request);
  const route = "/api/clients/[clientId]/documents";
  const startedAt = Date.now();
  const cookie = request.headers.get("cookie") ?? "";
  const session = await auth.api.getSession({
    headers: { cookie },
  });

  if (!session) {
    return jsonWithRequestId(
      requestId,
      { error: "Niet geautoriseerd" },
      { status: 401 },
    );
  }

  const { clientId } = await params;
  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      { requestId, route, clientId },
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonWithRequestId(requestId, { error: error.message }, { status: 403 });
    }
    throw error;
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonWithRequestId(
      requestId,
      { error: "Bestand is verplicht." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return jsonWithRequestId(
      requestId,
      { error: "Bestand is leeg." },
      { status: 400 },
    );
  }

  logInfo("documents.upload.start", {
    requestId,
    route,
    userId: session.user.id,
    clientId,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: file.size,
  });

  const storedName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const blobKey = `${clientId}/${storedName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let createdDocumentId: string | null = null;

  try {
    const blob = await uploadToBlob(
      blobKey,
      buffer,
      file.type || "application/octet-stream",
    );

    const createdDocument = await createClientDocument({
      clientId,
      originalName: file.name,
      storedName: blob.url,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      extractionStatus: DocumentExtractionStatus.PENDING,
      extractionError: null,
      extractedAt: null,
    });

    createdDocumentId = createdDocument.id;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError("documents.upload.error", {
      requestId,
      route,
      userId: session.user.id,
      clientId,
      filename: file.name,
      bytes: file.size,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      { error: "Uploaden is mislukt. Controleer blob-configuratie." },
      { status: 500 },
    );
  }

  if (createdDocumentId) {
    queueDocumentExtraction({
      requestId,
      route,
      userId: session.user.id,
      clientId,
      documentId: createdDocumentId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: file.size,
      buffer,
    });
  }

  const documents = await getClientDocuments(clientId);
  const durationMs = Date.now() - startedAt;
  logInfo("documents.upload.end", {
    requestId,
    route,
    userId: session.user.id,
    clientId,
    filename: file.name,
    bytes: file.size,
    documentId: createdDocumentId,
    extractionStatus: DocumentExtractionStatus.PENDING,
    extractionError: null,
    extractedChars: 0,
    extractionQueued: Boolean(createdDocumentId),
    status: 200,
    durationMs,
  });
  return jsonWithRequestId(requestId, { documents });
}
