import { NextResponse } from "next/server";

import { getServerSessionFromRequest } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import { getClientDocumentDebugRecords } from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";

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
  const route = "/api/clients/[clientId]/documents/debug";
  const startedAt = Date.now();

  if (process.env.NODE_ENV === "production") {
    return jsonWithRequestId(requestId, { error: "Niet gevonden." }, { status: 404 });
  }

  try {
    const session = await getServerSessionFromRequest(request, {
      requestId,
      source: `${route} GET`,
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
        return jsonWithRequestId(
          requestId,
          { error: error.message },
          { status: 403 },
        );
      }
      throw error;
    }

    const documents = await getClientDocumentDebugRecords(clientId);
    const durationMs = Date.now() - startedAt;
    logInfo("documents.debug.end", {
      requestId,
      route,
      userId: session.user.id,
      clientId,
      status: 200,
      durationMs,
      documentsCount: documents.length,
      extractedCount: documents.filter((document) => document.hasExtractedText).length,
    });

    return jsonWithRequestId(requestId, {
      clientId,
      documents,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError("documents.debug.error", {
      requestId,
      route,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      { error: "Document debug ophalen is mislukt." },
      { status: 500 },
    );
  }
}
