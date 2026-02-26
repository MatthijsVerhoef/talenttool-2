import { NextResponse } from "next/server";

import { runCoachAgent } from "@/lib/agents/service";
import { OpenAITimeoutError } from "@/lib/ai/openai";
import { auth } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import { getSessionWindow } from "@/lib/data/store";
import {
  getRequestId,
  logError,
  logInfo,
  withTimer,
} from "@/lib/observability";

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
  return response;
}

export async function GET(request: Request, { params }: Params) {
  const requestId = getRequestId(request);
  const route = "/api/coach/[clientId]";
  const startedAt = Date.now();
  logInfo("api.coach.get.start", {
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
      logInfo("api.coach.get.end", {
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
    try {
      await assertCanAccessClient(
        { id: session.user.id, role: session.user.role },
        clientId,
        { requestId, route, clientId },
      );
    } catch (error) {
      if (error instanceof ForbiddenError) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.coach.get.end", {
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

    const history = await getSessionWindow(session.user.id, clientId, 50);
    if (!history) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.coach.get.end", {
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

    const durationMs = Date.now() - startedAt;
    logInfo("api.coach.get.end", {
      requestId,
      route,
      method: "GET",
      userId: session.user.id,
      clientId,
      status: 200,
      durationMs,
      historyCount: history.length,
    });
    return jsonWithRequestId(requestId, { clientId, history });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError("api.coach.get.error", {
      requestId,
      route,
      method: "GET",
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      { error: "Coach is tijdelijk niet bereikbaar." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const requestId = getRequestId(request);
  const route = "/api/coach/[clientId]";
  const startedAt = Date.now();
  logInfo("api.coach.post.start", {
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
      logInfo("api.coach.post.end", {
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
    try {
      await assertCanAccessClient(
        { id: session.user.id, role: session.user.role },
        clientId,
        { requestId, route, clientId },
      );
    } catch (error) {
      if (error instanceof ForbiddenError) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.coach.post.end", {
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

    const body = await request.json();
    const message = (body?.message ?? "").toString().trim();
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId : undefined;

    if (!message) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.coach.post.end", {
        requestId,
        route,
        method: "POST",
        userId: session.user.id,
        clientId,
        conversationId: conversationId ?? null,
        messageLength: 0,
        status: 400,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Bericht is verplicht." },
        { status: 400 },
      );
    }

    const { result } = await withTimer(async () =>
      runCoachAgent({
        clientId,
        userMessage: message,
        requestId,
        userId: session.user.id,
        conversationId,
      }),
    );

    const updatedHistory = (await getSessionWindow(session.user.id, clientId)) ?? [];
    const durationMs = Date.now() - startedAt;
    logInfo("api.coach.post.end", {
      requestId,
      route,
      method: "POST",
      userId: session.user.id,
      clientId,
      conversationId: conversationId ?? null,
      messageLength: message.length,
      replyLength: result.reply.length,
      status: 200,
      durationMs,
      historyCount: updatedHistory.length,
      responseId: result.responseId,
    });

    return jsonWithRequestId(requestId, {
      clientId,
      reply: result.reply,
      responseId: result.responseId,
      usage: result.usage,
      history: updatedHistory,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = error instanceof OpenAITimeoutError;
    const status = isTimeout ? 504 : 500;
    logError("api.coach.post.error", {
      requestId,
      route,
      method: "POST",
      status,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      {
        error: isTimeout
          ? "Coach reageerde niet binnen de ingestelde tijd."
          : "Coach is tijdelijk niet bereikbaar.",
        requestId,
      },
      { status },
    );
  }
}
