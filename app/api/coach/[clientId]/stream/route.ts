import { NextResponse } from "next/server";

import {
  OpenAIRateLimitError,
  OpenAITimeoutError,
  runAgentCompletionStream,
} from "@/lib/ai/openai";
import { getServerSessionFromRequest } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import {
  appendClientMessage,
  getAIModelSettings,
  getClient,
  getClientDocumentContext,
  getCoachPrompt,
  getOrCreateCoachingSession,
  getSessionWindow,
  type AgentRole,
  type ClientProfile,
} from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";
import { DEFAULT_COACH_ROLE_PROMPT } from "@/lib/agents/prompts";

export const runtime = "nodejs";
const DEBUG_DOC_CONTEXT = process.env.DEBUG_DOC_CONTEXT === "1";
const COACH_DOCUMENT_CONTEXT_BUDGET_CHARS = Number(
  process.env.COACH_DOCUMENT_CONTEXT_BUDGET_CHARS ??
    process.env.DOCUMENT_CONTEXT_BUDGET_CHARS ??
    "6000",
);

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
  documentContextText: string,
) {
  const goals =
    client.goals.length > 0
      ? client.goals.join("; ")
      : "Nog geen doelen vastgelegd";
  const docText = buildDocumentContextSection(documentContextText);
  return [
    basePrompt,
    `Cliënt: ${client.name}. Focus: ${client.focusArea}. Samenvatting: ${client.summary}. Doelen: ${goals}.`,
    "Gedragsregel: als documentcontext aanwezig is, gebruik die actief en zeg nooit dat je geen toegang hebt tot cliëntdocumenten. Als iets ontbreekt, zeg: 'Dit staat niet in de huidige documentcontext.'",
    docText,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildDocumentContextSection(contextText: string) {
  const trimmed = contextText.trim();
  if (!trimmed) {
    return "";
  }

  return [
    "CLIENT_DOCUMENT_CONTEXT",
    "Gebruik alleen deze context als ondersteunend bewijs; verzin geen ontbrekende details.",
    "<<<CLIENT_DOCUMENT_CONTEXT>>>",
    trimmed,
    "<<<END_CLIENT_DOCUMENT_CONTEXT>>>",
  ].join("\n");
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

  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/coach/[clientId]/stream POST",
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

          const [history, storedPrompt, models, latestClient, documentContext] =
            await Promise.all([
              getSessionWindow(userId, clientId),
              getCoachPrompt(),
              getAIModelSettings(),
              getClient(clientId),
              getClientDocumentContext({
                userId,
                role: session.user.role,
                clientId,
                queryText: message,
                budgetChars: COACH_DOCUMENT_CONTEXT_BUDGET_CHARS,
                requestId,
              }),
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
                documentContext.contextText,
              ),
            },
            ...((history ?? []).map((entry) => ({
              role: normalizeRole(entry.role),
              content: formatMessageForAgent(entry),
            })) as Array<{ role: ChatRole; content: string }>),
          ];
          const documentIds = Array.from(
            new Set(documentContext.sources.map((source) => source.documentId)),
          );
          const filenames = Array.from(
            new Set(documentContext.sources.map((source) => source.filename)),
          );
          const streamSystemPrompt = completionMessages[0]?.content ?? "";
          logInfo("api.coach.stream.context.attached", {
            requestId,
            route,
            method: "POST",
            userId,
            clientId,
            conversationId: conversationId ?? null,
            messageLength: message.length,
            historyCount: (history ?? []).length,
            messagesCount: completionMessages.length,
            systemPromptChars: streamSystemPrompt.length,
            hasContextBoundary: streamSystemPrompt.includes(
              "<<<CLIENT_DOCUMENT_CONTEXT>>>",
            ),
            documentContextChunkCount: documentContext.sources.length,
            documentContextDocsConsidered: documentContext.docsConsidered,
            documentContextChunksConsidered: documentContext.chunksConsidered,
            documentContextDocumentCount: documentIds.length,
            documentContextChars: documentContext.contextText.length,
            documentIds,
            filenames: filenames.slice(0, 12),
          });

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
            ...(DEBUG_DOC_CONTEXT
              ? {
                  documentContextSources: documentContext.sources,
                  docContext: {
                    docsConsidered: documentContext.docsConsidered,
                    chunksSelected: documentContext.sources.length,
                    totalChars: documentContext.totalChars,
                    sources: documentContext.sources,
                  },
                }
              : {}),
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
            documentContextChunkCount: documentContext.sources.length,
            documentContextDocsConsidered: documentContext.docsConsidered,
            documentContextChars: documentContext.contextText.length,
            responseId: completion.responseId,
            status: 200,
            durationMs,
          });
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const isTimeout = error instanceof OpenAITimeoutError;
          const isRateLimit = error instanceof OpenAIRateLimitError;
          const isAbortError =
            isAborted ||
            localAbortController.signal.aborted ||
            (error instanceof Error && error.message === "Aborted");

          if (!isAbortError) {
            send("error", {
              error: isTimeout
                ? "Coach reageerde niet binnen de ingestelde tijd."
                : isRateLimit
                  ? "Coach is tijdelijk druk door rate limits. Probeer het over enkele seconden opnieuw."
                  : "Coach is tijdelijk niet bereikbaar.",
              status: isRateLimit ? 429 : isTimeout ? 504 : 500,
              retryAfterMs:
                error instanceof OpenAIRateLimitError ? (error.retryAfterMs ?? null) : null,
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
            status: isTimeout ? 504 : isRateLimit ? 429 : isAbortError ? 499 : 500,
            durationMs,
            errorMessage: error instanceof Error ? error.message : String(error),
            retryAfterMs:
              error instanceof OpenAIRateLimitError ? (error.retryAfterMs ?? null) : null,
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
