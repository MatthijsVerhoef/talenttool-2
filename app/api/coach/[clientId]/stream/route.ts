import { NextResponse } from "next/server";

import { OpenAITimeoutError, runAgentCompletionStream } from "@/lib/ai/openai";
import { auth } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import {
  appendClientMessage,
  getAIModelSettings,
  getClient,
  getCoachPrompt,
  getDocumentSnippets,
  getOrCreateCoachingSession,
  getSessionWindow,
  type AgentRole,
  type ClientProfile,
} from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";
import { DEFAULT_COACH_ROLE_PROMPT } from "@/lib/agents/prompts";

export const runtime = "nodejs";

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

function toSseEvent(event: string, payload: unknown) {
  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const data = serialized
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  return `event: ${event}\n${data}\n\n`;
}

type ChatRole = "user" | "assistant" | "system";

function normalizeRole(role: string): ChatRole {
  if (role === "assistant" || role === "system") {
    return role;
  }
  return "user";
}

function formatMessageForAgent(message: {
  source: string;
  role: AgentRole;
  content: string;
}) {
  const sourceLabel = message.source === "HUMAN" ? "Menselijke coach" : "AI-coach";
  return `[${sourceLabel} · rol: ${message.role}]\n${message.content}`;
}

function buildCoachSystemPrompt(
  basePrompt: string,
  client: ClientProfile,
  documentSnippets: string[],
) {
  const goals =
    client.goals.length > 0
      ? client.goals.join("; ")
      : "Nog geen doelen vastgelegd";
  const docText =
    documentSnippets.length > 0
      ? `Extra context uit documenten:\n${documentSnippets.join("\n\n")}`
      : "";
  return [
    basePrompt,
    `Cliënt: ${client.name}. Focus: ${client.focusArea}. Samenvatting: ${client.summary}. Doelen: ${goals}.`,
    docText,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(request: Request, { params }: Params) {
  const requestId = getRequestId(request);
  const route = "/api/coach/[clientId]/stream";
  const startedAt = Date.now();
  logInfo("api.coach.stream.start", {
    requestId,
    route,
    method: "POST",
  });

  const cookie = request.headers.get("cookie") ?? "";
  const session = await auth.api.getSession({
    headers: { cookie },
  });

  if (!session) {
    const durationMs = Date.now() - startedAt;
    logInfo("api.coach.stream.end", {
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
      logInfo("api.coach.stream.end", {
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

  const body = await request.json().catch(() => null);
  const message = (body && typeof body === "object" ? (body as { message?: unknown }).message : "")
    ?.toString()
    .trim();
  const conversationId =
    body && typeof body === "object" && typeof (body as { conversationId?: unknown }).conversationId === "string"
      ? ((body as { conversationId?: string }).conversationId ?? undefined)
      : undefined;

  if (!message) {
    const durationMs = Date.now() - startedAt;
    logInfo("api.coach.stream.end", {
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

  const encoder = new TextEncoder();
  const userId = session.user.id;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      let isAborted = false;
      const localAbortController = new AbortController();

      const close = () => {
        if (isClosed) {
          return;
        }
        isClosed = true;
        controller.close();
      };

      const send = (event: string, payload: unknown) => {
        if (isClosed || isAborted) {
          return;
        }
        controller.enqueue(encoder.encode(toSseEvent(event, payload)));
      };

      const onRequestAbort = () => {
        isAborted = true;
        localAbortController.abort();
      };

      request.signal.addEventListener("abort", onRequestAbort, { once: true });

      void (async () => {
        try {
          const sessionRecord = await getOrCreateCoachingSession(userId, clientId);
          if (!sessionRecord) {
            send("error", { error: "Cliënt niet gevonden.", requestId });
            return;
          }

          send("meta", {
            requestId,
            clientId,
            sessionId: sessionRecord.id,
          });

          await appendClientMessage(
            userId,
            clientId,
            "user",
            message,
            undefined,
            "HUMAN",
          );

          const [history, documentSnippets, storedPrompt, models, latestClient] =
            await Promise.all([
              getSessionWindow(userId, clientId),
              getDocumentSnippets(clientId),
              getCoachPrompt(),
              getAIModelSettings(),
              getClient(clientId),
            ]);

          if (!latestClient) {
            send("error", { error: "Cliënt niet gevonden.", requestId });
            return;
          }

          const coachPrompt = storedPrompt?.content ?? DEFAULT_COACH_ROLE_PROMPT;
          const completionMessages = [
            {
              role: "system" as const,
              content: buildCoachSystemPrompt(
                coachPrompt,
                latestClient,
                documentSnippets,
              ),
            },
            ...((history ?? []).map((entry) => ({
              role: normalizeRole(entry.role),
              content: formatMessageForAgent(entry),
            })) as Array<{ role: ChatRole; content: string }>),
          ];

          let assistantReply = "";
          const completion = await runAgentCompletionStream({
            model: models.coachModel,
            messages: completionMessages,
            requestId,
            operation: "coach-stream",
            signal: localAbortController.signal,
            onDelta: (delta) => {
              assistantReply += delta;
              send("delta", { text: delta });
            },
          });

          if (isAborted) {
            return;
          }

          const trimmedReply = assistantReply.trim();
          if (trimmedReply.length > 0) {
            await appendClientMessage(
              userId,
              clientId,
              "assistant",
              trimmedReply,
              {
                responseId: completion.responseId,
                usage: completion.usage,
              },
              "AI",
            );
          }

          send("done", {
            requestId,
            clientId,
            responseId: completion.responseId,
            usage: completion.usage,
          });

          const durationMs = Date.now() - startedAt;
          logInfo("api.coach.stream.end", {
            requestId,
            route,
            method: "POST",
            userId,
            clientId,
            conversationId: conversationId ?? null,
            messageLength: message.length,
            replyLength: trimmedReply.length,
            responseId: completion.responseId,
            status: 200,
            durationMs,
          });
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const isTimeout = error instanceof OpenAITimeoutError;
          const isAbortError =
            isAborted ||
            localAbortController.signal.aborted ||
            (error instanceof Error && error.message === "Aborted");

          if (!isAbortError) {
            send("error", {
              error: isTimeout
                ? "Coach reageerde niet binnen de ingestelde tijd."
                : "Coach is tijdelijk niet bereikbaar.",
              requestId,
            });
          }

          logError("api.coach.stream.error", {
            requestId,
            route,
            method: "POST",
            userId,
            clientId,
            conversationId: conversationId ?? null,
            status: isTimeout ? 504 : isAbortError ? 499 : 500,
            durationMs,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        } finally {
          request.signal.removeEventListener("abort", onRequestAbort);
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "x-request-id": requestId,
    },
  });
}
