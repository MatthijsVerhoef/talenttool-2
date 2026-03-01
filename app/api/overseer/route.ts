import { NextResponse } from "next/server";

import { runOverseerAgent } from "@/lib/agents/service";
import { OpenAITimeoutError } from "@/lib/ai/openai";
import { auth } from "@/lib/auth";
import {
  assertCanAccessClient,
  ForbiddenError,
  isAdmin,
  isCoach,
} from "@/lib/authz";
import {
  getOverseerWindow,
  getOwnedAgentMessage,
  getOwnedCoachingSession,
} from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";

function jsonWithRequestId(
  requestId: string,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("x-request-id", requestId);
  return response;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const route = "/api/overseer";
  const startedAt = Date.now();
  logInfo("api.overseer.get.start", {
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
      logInfo("api.overseer.get.end", {
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

    const user = { id: session.user.id, role: session.user.role };
    if (!isAdmin(user) && !isCoach(user)) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.overseer.get.end", {
        requestId,
        route,
        method: "GET",
        userId: session.user.id,
        status: 403,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Niet geautoriseerd" },
        { status: 403 },
      );
    }

    const coachUserId = session.user.id;
    const thread = await getOverseerWindow(coachUserId);
    const durationMs = Date.now() - startedAt;
    logInfo("api.overseer.get.end", {
      requestId,
      route,
      method: "GET",
      userId: session.user.id,
      coachUserId,
      status: 200,
      durationMs,
      threadCount: thread.length,
    });
    return jsonWithRequestId(requestId, { thread });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError("api.overseer.get.error", {
      requestId,
      route,
      method: "GET",
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      { error: "Overzichtscoach is tijdelijk niet bereikbaar." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const route = "/api/overseer";
  const startedAt = Date.now();
  logInfo("api.overseer.post.start", {
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
      logInfo("api.overseer.post.end", {
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

    const user = { id: session.user.id, role: session.user.role };
    if (!isAdmin(user) && !isCoach(user)) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.overseer.post.end", {
        requestId,
        route,
        method: "POST",
        userId: session.user.id,
        status: 403,
        durationMs,
      });
      return jsonWithRequestId(
        requestId,
        { error: "Niet geautoriseerd" },
        { status: 403 },
      );
    }

    const coachUserId = session.user.id;
    const body = await request.json();
    const message = (body?.message ?? "").toString().trim();
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId : undefined;
    const clientId =
      typeof body?.clientId === "string" && body.clientId.trim().length > 0
        ? body.clientId.trim()
        : undefined;
    const coachingSessionId =
      typeof body?.coachingSessionId === "string" &&
      body.coachingSessionId.trim().length > 0
        ? body.coachingSessionId.trim()
        : undefined;
    const sourceAgentMessageId =
      typeof body?.sourceAgentMessageId === "string" &&
      body.sourceAgentMessageId.trim().length > 0
        ? body.sourceAgentMessageId.trim()
        : undefined;

    if (!message) {
      const durationMs = Date.now() - startedAt;
      logInfo("api.overseer.post.end", {
        requestId,
        route,
        method: "POST",
        userId: session.user.id,
        coachUserId,
        conversationId: conversationId ?? null,
        clientId: clientId ?? null,
        coachingSessionId: coachingSessionId ?? null,
        sourceAgentMessageId: sourceAgentMessageId ?? null,
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

    if (clientId) {
      try {
        await assertCanAccessClient(user, clientId, {
          requestId,
          route,
          clientId,
        });
      } catch (error) {
        if (error instanceof ForbiddenError) {
          const durationMs = Date.now() - startedAt;
          logInfo("api.overseer.post.end", {
            requestId,
            route,
            method: "POST",
            userId: session.user.id,
            coachUserId,
            conversationId: conversationId ?? null,
            clientId,
            coachingSessionId: coachingSessionId ?? null,
            sourceAgentMessageId: sourceAgentMessageId ?? null,
            status: 403,
            durationMs,
            reason: "client_access_denied",
          });
          return jsonWithRequestId(
            requestId,
            { error: error.message },
            { status: 403 },
          );
        }
        throw error;
      }
    }

    if (coachingSessionId) {
      const coachingSession = await getOwnedCoachingSession(
        coachUserId,
        coachingSessionId,
      );
      if (!coachingSession) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.overseer.post.end", {
          requestId,
          route,
          method: "POST",
          userId: session.user.id,
          coachUserId,
          conversationId: conversationId ?? null,
          clientId: clientId ?? null,
          coachingSessionId,
          sourceAgentMessageId: sourceAgentMessageId ?? null,
          status: 403,
          durationMs,
          reason: "coaching_session_access_denied",
        });
        return jsonWithRequestId(
          requestId,
          { error: "Geen toegang tot deze coachsessie." },
          { status: 403 },
        );
      }
      if (clientId && coachingSession.clientId !== clientId) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.overseer.post.end", {
          requestId,
          route,
          method: "POST",
          userId: session.user.id,
          coachUserId,
          conversationId: conversationId ?? null,
          clientId,
          coachingSessionId,
          sourceAgentMessageId: sourceAgentMessageId ?? null,
          status: 403,
          durationMs,
          reason: "context_client_session_mismatch",
        });
        return jsonWithRequestId(
          requestId,
          { error: "Context bevat een ongeldige cliënt/sessie-combinatie." },
          { status: 403 },
        );
      }
    }

    if (sourceAgentMessageId) {
      const sourceMessage = await getOwnedAgentMessage(
        coachUserId,
        sourceAgentMessageId,
      );
      if (!sourceMessage) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.overseer.post.end", {
          requestId,
          route,
          method: "POST",
          userId: session.user.id,
          coachUserId,
          conversationId: conversationId ?? null,
          clientId: clientId ?? null,
          coachingSessionId: coachingSessionId ?? null,
          sourceAgentMessageId,
          status: 403,
          durationMs,
          reason: "source_agent_message_access_denied",
        });
        return jsonWithRequestId(
          requestId,
          { error: "Geen toegang tot dit bronbericht." },
          { status: 403 },
        );
      }
      if (coachingSessionId && sourceMessage.sessionId !== coachingSessionId) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.overseer.post.end", {
          requestId,
          route,
          method: "POST",
          userId: session.user.id,
          coachUserId,
          conversationId: conversationId ?? null,
          clientId: clientId ?? null,
          coachingSessionId,
          sourceAgentMessageId,
          status: 403,
          durationMs,
          reason: "context_session_source_mismatch",
        });
        return jsonWithRequestId(
          requestId,
          {
            error:
              "Context bevat een ongeldige sessie/bronbericht-combinatie.",
          },
          { status: 403 },
        );
      }
      if (clientId && sourceMessage.clientId !== clientId) {
        const durationMs = Date.now() - startedAt;
        logInfo("api.overseer.post.end", {
          requestId,
          route,
          method: "POST",
          userId: session.user.id,
          coachUserId,
          conversationId: conversationId ?? null,
          clientId,
          coachingSessionId: coachingSessionId ?? null,
          sourceAgentMessageId,
          status: 403,
          durationMs,
          reason: "context_client_source_mismatch",
        });
        return jsonWithRequestId(
          requestId,
          { error: "Context bevat een ongeldige cliënt/bronbericht-combinatie." },
          { status: 403 },
        );
      }
    }

    const result = await runOverseerAgent({
      coachUserId,
      userMessage: message,
      requestId,
      userId: coachUserId,
      conversationId,
      context: {
        clientId,
        coachingSessionId,
        sourceAgentMessageId,
      },
    });

    const thread = await getOverseerWindow(coachUserId);
    const durationMs = Date.now() - startedAt;
    logInfo("api.overseer.post.end", {
      requestId,
      route,
      method: "POST",
      userId: session.user.id,
      coachUserId,
      conversationId: conversationId ?? null,
      clientId: clientId ?? null,
      coachingSessionId: coachingSessionId ?? null,
      sourceAgentMessageId: sourceAgentMessageId ?? null,
      messageLength: message.length,
      replyLength: result.reply.length,
      responseId: result.responseId,
      threadCount: thread.length,
      status: 200,
      durationMs,
    });

    return jsonWithRequestId(requestId, {
      reply: result.reply,
      responseId: result.responseId,
      usage: result.usage,
      thread,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = error instanceof OpenAITimeoutError;
    const status = isTimeout ? 504 : 500;
    logError("api.overseer.post.error", {
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
          ? "Overzichtscoach reageerde niet binnen de ingestelde tijd."
          : "Overzichtscoach is tijdelijk niet bereikbaar.",
        requestId,
      },
      { status },
    );
  }
}
