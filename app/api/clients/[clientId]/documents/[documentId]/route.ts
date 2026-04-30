import { DocumentExtractionStatus } from "@prisma/client";

import { getServerSessionFromRequest } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import { jsonWithRequestId } from "@/lib/http/response";
import { deleteFromBlob } from "@/lib/blob";
import {
  deleteClientDocumentById,
  getClientDocumentById,
  getClientDocuments,
  renameClientDocument,
  updateClientDocumentExtraction,
} from "@/lib/data/documents";
import { extractDocumentContent } from "@/lib/documents/extract";
import { getRequestId, logError, logInfo } from "@/lib/observability";

interface RouteParams {
  params: Promise<{
    clientId: string;
    documentId: string;
  }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  const route = "/api/clients/[clientId]/documents/[documentId]";
  const startedAt = Date.now();
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients/[clientId]/documents/[documentId] POST",
  });

  if (!session) {
    return jsonWithRequestId(
      requestId,
      { error: "Niet geautoriseerd" },
      { status: 401 }
    );
  }

  const { clientId, documentId } = await params;
  if (!clientId || !documentId) {
    return jsonWithRequestId(
      requestId,
      { error: "Coachee of document ontbreekt." },
      { status: 400 }
    );
  }

  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      { requestId, route, clientId }
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonWithRequestId(
        requestId,
        { error: error.message },
        { status: 403 }
      );
    }
    throw error;
  }

  const document = await getClientDocumentById(documentId, clientId);
  if (!document) {
    return jsonWithRequestId(
      requestId,
      { error: "Document niet gevonden." },
      { status: 404 }
    );
  }

  logInfo("documents.reprocess.start", {
    requestId,
    route,
    userId: session.user.id,
    clientId,
    documentId,
    filename: document.originalName,
    mimeType: document.mimeType,
    bytes: document.size,
  });

  try {
    const response = await fetch(document.storedName, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      return jsonWithRequestId(
        requestId,
        { error: "Kon bronbestand niet laden voor herverwerking." },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const extraction = await extractDocumentContent({
      buffer,
      fileName: document.originalName,
      mimeType: document.mimeType,
      requestId,
    });

    const updated = await updateClientDocumentExtraction({
      documentId,
      clientId,
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

    if (!updated) {
      return jsonWithRequestId(
        requestId,
        { error: "Document niet gevonden." },
        { status: 404 }
      );
    }

    const durationMs = Date.now() - startedAt;
    logInfo("documents.reprocess.end", {
      requestId,
      route,
      userId: session.user.id,
      clientId,
      documentId,
      extractionStatus: extraction.extractionStatus,
      extractionError: extraction.extractionError ?? null,
      extractedChars: extraction.content?.length ?? 0,
      status: 200,
      durationMs,
    });

    const documents = await getClientDocuments(clientId);
    return jsonWithRequestId(requestId, {
      success: true,
      document: updated,
      documents,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError("documents.reprocess.error", {
      requestId,
      route,
      userId: session.user.id,
      clientId,
      documentId,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    await updateClientDocumentExtraction({
      documentId,
      clientId,
      extractionStatus: DocumentExtractionStatus.FAILED,
      extractionError:
        error instanceof Error ? error.message : "Herverwerking mislukt.",
      extractedAt: new Date(),
    }).catch(() => null);

    return jsonWithRequestId(
      requestId,
      { error: "Herverwerking van document is mislukt." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients/[clientId]/documents/[documentId] DELETE",
  });

  if (!session) {
    return jsonWithRequestId(
      requestId,
      { error: "Niet geautoriseerd" },
      { status: 401 }
    );
  }

  const { clientId, documentId } = await params;

  if (!clientId || !documentId) {
    return jsonWithRequestId(
      requestId,
      { error: "Coachee of document ontbreekt." },
      { status: 400 }
    );
  }

  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      {
        requestId,
        route: "/api/clients/[clientId]/documents/[documentId]",
        clientId,
      }
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonWithRequestId(
        requestId,
        { error: error.message },
        { status: 403 }
      );
    }
    throw error;
  }

  const document = await getClientDocumentById(documentId, clientId);
  if (!document) {
    return jsonWithRequestId(
      requestId,
      { error: "Document niet gevonden." },
      { status: 404 }
    );
  }

  if (document.storedName) {
    await deleteFromBlob(document.storedName).catch((blobError) => {
      console.error("Blob delete failed", blobError);
    });
  }

  const deleted = await deleteClientDocumentById(documentId, clientId);
  if (!deleted) {
    return jsonWithRequestId(
      requestId,
      { error: "Document verwijderen is mislukt." },
      { status: 500 }
    );
  }

  const documents = await getClientDocuments(clientId);

  return jsonWithRequestId(requestId, {
    success: true,
    documents,
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients/[clientId]/documents/[documentId] PATCH",
  });

  if (!session) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { clientId, documentId } = await params;
  if (!clientId || !documentId) {
    return jsonWithRequestId(requestId, { error: "Coachee of document ontbreekt." }, { status: 400 });
  }

  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      { requestId, route: "/api/clients/[clientId]/documents/[documentId]", clientId }
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonWithRequestId(requestId, { error: error.message }, { status: 403 });
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonWithRequestId(requestId, { error: "Ongeldig verzoek." }, { status: 400 });
  }

  const { displayName } = body as { displayName?: string };
  if (typeof displayName !== "string") {
    return jsonWithRequestId(requestId, { error: "displayName is verplicht." }, { status: 400 });
  }

  const updated = await renameClientDocument(documentId, clientId, displayName);
  if (!updated) {
    return jsonWithRequestId(requestId, { error: "Document niet gevonden." }, { status: 404 });
  }

  const documents = await getClientDocuments(clientId);
  return jsonWithRequestId(requestId, { success: true, document: updated, documents });
}
