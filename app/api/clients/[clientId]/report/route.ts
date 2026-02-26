import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

import { generateClientReport } from "@/lib/agents/service";
import { OpenAITimeoutError } from "@/lib/ai/openai";
import { auth } from "@/lib/auth";
import { getClientForUser, listClientReports } from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";

interface RouteParams {
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
    const session = await auth.api.getSession({
      headers: request.headers,
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

    const client = await getClientForUser(
      clientId,
      session.user.id,
      session.user.role as UserRole,
    );
    if (!client) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.client-report.get.end", {
        requestId,
        route,
        method: "GET",
        userId: session.user.id,
        clientId,
        status: 404,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Cliënt niet gevonden." },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 5;

    const reports = await listClientReports(
      clientId,
      Number.isNaN(limit) ? 5 : limit,
    );
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
    const session = await auth.api.getSession({
      headers: request.headers,
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

    const client = await getClientForUser(
      clientId,
      session.user.id,
      session.user.role as UserRole,
    );
    if (!client) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.client-report.post.end", {
        requestId,
        route,
        method: "POST",
        userId: session.user.id,
        clientId,
        status: 404,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Cliënt niet gevonden." },
        { status: 404 },
      );
    }

    const result = await generateClientReport({
      clientId,
      requestId,
      userId: session.user.id,
    });
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
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = error instanceof OpenAITimeoutError;
    const message =
      error instanceof Error ? error.message : "Rapport genereren is mislukt.";
    const status = isTimeout ? 504 : message.includes("niet gevonden") ? 404 : 500;
    logError("api.client-report.post.error", {
      requestId,
      route,
      method: "POST",
      durationMs,
      status,
      errorMessage: message,
    });
    return jsonWithRequestId(
      requestId,
      {
        error: isTimeout
          ? "Rapportgeneratie reageerde niet binnen de ingestelde tijd."
          : message,
        requestId,
      },
      { status },
    );
  }
}
