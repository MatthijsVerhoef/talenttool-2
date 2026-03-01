import { NextResponse } from "next/server";

import { uploadToBlob } from "@/lib/blob";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import {
  createClientDocument,
  getClientDocuments,
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

  const extraction = await extractDocumentContent({
    buffer,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    requestId,
  });

  try {
    const blob = await uploadToBlob(
      blobKey,
      buffer,
      file.type || "application/octet-stream",
    );

    await createClientDocument({
      clientId,
      originalName: file.name,
      storedName: blob.url,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      content: extraction.content,
      kind: extraction.kind,
      audioDuration: extraction.audioDuration,
      extractionStatus: extraction.extractionStatus,
      extractionError: extraction.extractionError ?? null,
      extractedAt: extraction.extractedAt,
    });
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

  const documents = await getClientDocuments(clientId);
  const durationMs = Date.now() - startedAt;
  logInfo("documents.upload.end", {
    requestId,
    route,
    userId: session.user.id,
    clientId,
    filename: file.name,
    bytes: file.size,
    extractionStatus: extraction.extractionStatus,
    extractionError: extraction.extractionError ?? null,
    extractedChars: extraction.content?.length ?? 0,
    status: 200,
    durationMs,
  });
  return jsonWithRequestId(requestId, { documents });
}
