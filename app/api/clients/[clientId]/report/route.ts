import { NextResponse } from "next/server";

import { generateClientReport } from "@/lib/agents/service";
import { OpenAIRateLimitError, OpenAITimeoutError } from "@/lib/ai/openai";
import { auth } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import { listClientReports } from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";

interface RouteParams {
  params: Promise<{
    clientId: string;
  }>;
}

const DEBUG_DOC_CONTEXT = process.env.DEBUG_DOC_CONTEXT === "1";

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

export async function GET(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  const route = "/api/clients/[clientId]/report";
  const startedAt = Date.now();
  logInfo("api.client-report.get.start", {
    requestId,
    route,
    method: "GET",
  });

  try {
    const cookie = request.headers.get("cookie") ?? "";
    const session = await auth.api.getSession({
      headers: { cookie },
    });

    if (!session) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.client-report.get.end", {
        requestId,
        route,
        method: "GET",
        status: 401,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Niet geautoriseerd" },
        { status: 401 },
      );
    }

    const { clientId } = await params;
    if (!clientId) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.client-report.get.end", {
        requestId,
        route,
        method: "GET",
        userId: session.user.id,
        status: 400,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Cliënt ontbreekt." },
        { status: 400 },
      );
    }

    try {
      await assertCanAccessClient(
        { id: session.user.id, role: session.user.role },
        clientId,
        { requestId, route, clientId },
      );
    } catch (error) {
      if (error instanceof ForbiddenError) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.client-report.get.end", {
          requestId,
          route,
          method: "GET",
          userId: session.user.id,
          clientId,
          status: 403,
          durationMs,
        });
        return jsonWithRequestId(
          requestId,
          { error: error.message },
          { status: 403 },
        );
      }
      throw error;
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit") ?? "5");
    const limit = Number.isNaN(limitParam) ? 5 : Math.max(1, Math.min(limitParam, 20));

    const reports = await listClientReports(clientId, limit);
    const durationMs = Date.now() - startedAt;
    logInfo("api.client-report.get.end", {
      requestId,
      route,
      method: "GET",
      userId: session.user.id,
      clientId,
      reportCount: reports.length,
      status: 200,
      durationMs,
    });

    return jsonWithRequestId(requestId, { reports });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError("api.client-report.get.error", {
      requestId,
      route,
      method: "GET",
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      { error: "Rapport ophalen is mislukt." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  const route = "/api/clients/[clientId]/report";
  const startedAt = Date.now();
  logInfo("api.client-report.post.start", {
    requestId,
    route,
    method: "POST",
  });

  try {
    const cookie = request.headers.get("cookie") ?? "";
    const session = await auth.api.getSession({
      headers: { cookie },
    });

    if (!session) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.client-report.post.end", {
        requestId,
        route,
        method: "POST",
        status: 401,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Niet geautoriseerd" },
        { status: 401 },
      );
    }

    const { clientId } = await params;

    if (!clientId) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.client-report.post.end", {
        requestId,
        route,
        method: "POST",
        userId: session.user.id,
        status: 400,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Cliënt ontbreekt." },
        { status: 400 },
      );
    }

    try {
      await assertCanAccessClient(
        { id: session.user.id, role: session.user.role },
        clientId,
        { requestId, route, clientId },
      );
    } catch (error) {
      if (error instanceof ForbiddenError) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.client-report.post.end", {
          requestId,
          route,
          method: "POST",
          userId: session.user.id,
          clientId,
          status: 403,
          durationMs,
        });
        return jsonWithRequestId(
          requestId,
          { error: error.message },
          { status: 403 },
        );
      }
      throw error;
    }

    const result = await generateClientReport({
      clientId,
      requestId,
      userId: session.user.id,
      role: session.user.role,
    });
    const documentIds = Array.from(
      new Set((result.documentContextSources ?? []).map((source) => source.documentId)),
    );
    const durationMs = Date.now() - startedAt;
    logInfo("api.client-report.post.end", {
      requestId,
      route,
      method: "POST",
      userId: session.user.id,
      clientId,
      status: 200,
      durationMs,
      responseId: result.responseId,
      reportId: result.reportId ?? null,
      replyLength: result.reply.length,
      documentContextChunkCount: result.documentContextSources?.length ?? 0,
      documentContextDocsConsidered: result.docContext?.docsConsidered ?? null,
      documentContextChars: result.docContext?.totalChars ?? null,
      documentContextDocumentCount: documentIds.length,
      documentIds,
      totalTokens: result.usage?.totalTokens,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });

    return jsonWithRequestId(requestId, {
      report: result.reply,
      responseId: result.responseId,
      usage: result.usage ?? null,
      reportId: result.reportId,
      createdAt: result.createdAt,
      ...(DEBUG_DOC_CONTEXT
        ? {
            documentContextSources: result.documentContextSources ?? [],
            docContext: result.docContext ?? {
              docsConsidered: 0,
              chunksSelected: 0,
              totalChars: 0,
              sources: [],
            },
          }
        : {}),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = error instanceof OpenAITimeoutError;
    const isRateLimit = error instanceof OpenAIRateLimitError;
    const message =
      error instanceof Error ? error.message : "Rapport genereren is mislukt.";
    const status = isTimeout
      ? 504
      : isRateLimit
        ? 429
        : message.includes("niet gevonden")
          ? 404
          : 500;
    logError("api.client-report.post.error", {
      requestId,
      route,
      method: "POST",
      durationMs,
      status,
      errorMessage: message,
      retryAfterMs:
        error instanceof OpenAIRateLimitError ? (error.retryAfterMs ?? null) : null,
    });
    return jsonWithRequestId(
      requestId,
      {
        error: isTimeout
          ? "Rapportgeneratie reageerde niet binnen de ingestelde tijd."
          : isRateLimit
            ? "Rapportgeneratie is tijdelijk druk door rate limits. Probeer het over enkele seconden opnieuw."
            : message,
        retryAfterMs:
          error instanceof OpenAIRateLimitError ? (error.retryAfterMs ?? null) : null,
        requestId,
      },
      { status },
    );
  }
}
