import {
  OpenAIRateLimitError,
  OpenAITimeoutError,
  runAgentCompletionStream,
} from "@/lib/ai/openai";
import {
  formatMessageForAgent,
  normalizeRole,
} from "@/lib/agents/prompt-builder";
import { DEFAULT_OVERSEER_ROLE_PROMPT } from "@/lib/agents/prompts";
import { getServerSessionFromRequest } from "@/lib/auth";
import { isAdmin, isCoach } from "@/lib/authz";
import { listClientDigestsForCoach } from "@/lib/data/clients";
import { getOverseerPrompt } from "@/lib/data/prompts";
import { appendOverseerMessage, getOverseerWindow } from "@/lib/data/sessions";
import { getAIModelSettings } from "@/lib/data/settings";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId, logError, logInfo } from "@/lib/observability";

export const runtime = "nodejs";

function toSseEvent(event: string, payload: unknown) {
  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const data = serialized
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  return `event: ${event}\n${data}\n\n`;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const route = "/api/overseer/stream";
  const startedAt = Date.now();

  logInfo("api.overseer.stream.start", { requestId, route, method: "POST" });

  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/overseer/stream POST",
  });

  if (!session) {
    logInfo("api.overseer.stream.end", {
      requestId,
      route,
      method: "POST",
      status: 401,
      durationMs: Date.now() - startedAt,
    });
    return jsonWithRequestId(
      requestId,
      { error: "Niet geautoriseerd" },
      { status: 401 }
    );
  }

  const user = { id: session.user.id, role: session.user.role };
  if (!isAdmin(user) && !isCoach(user)) {
    logInfo("api.overseer.stream.end", {
      requestId,
      route,
      method: "POST",
      userId: session.user.id,
      status: 403,
      durationMs: Date.now() - startedAt,
    });
    return jsonWithRequestId(
      requestId,
      { error: "Niet geautoriseerd" },
      { status: 403 }
    );
  }

  const coachUserId = session.user.id;
  const body = await request.json();
  const message = (body?.message ?? "").toString().trim();
  const clientId =
    typeof body?.clientId === "string" && body.clientId.trim().length > 0
      ? body.clientId.trim()
      : undefined;

  if (!message) {
    logInfo("api.overseer.stream.end", {
      requestId,
      route,
      method: "POST",
      userId: coachUserId,
      status: 400,
      durationMs: Date.now() - startedAt,
    });
    return jsonWithRequestId(
      requestId,
      { error: "Bericht is verplicht." },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;
      let isAborted = false;
      const localAbortController = new AbortController();

      const close = () => {
        if (isClosed) return;
        isClosed = true;
        controller.close();
      };

      const send = (event: string, payload: unknown) => {
        if (isClosed || isAborted) return;
        controller.enqueue(encoder.encode(toSseEvent(event, payload)));
      };

      const onRequestAbort = () => {
        isAborted = true;
        localAbortController.abort();
      };

      request.signal.addEventListener("abort", onRequestAbort, { once: true });

      void (async () => {
        try {
          send("meta", { requestId });

          const storedUserMessage = await appendOverseerMessage(
            coachUserId,
            "user",
            message,
            { clientId, source: "HUMAN" }
          );

          const [history, storedPrompt, models, clientDigests] =
            await Promise.all([
              getOverseerWindow(coachUserId),
              getOverseerPrompt(),
              getAIModelSettings(),
              listClientDigestsForCoach(coachUserId),
            ]);

          const systemPrompt =
            storedPrompt?.content ?? DEFAULT_OVERSEER_ROLE_PROMPT;
          const completionMessages = [
            {
              role: "system" as const,
              content: `${systemPrompt}\n\nCliëntoverzichten:\n${clientDigests.join("\n\n")}`,
            },
            ...history
              .filter((m) => m.role !== "system")
              .map((m) => ({
                role: normalizeRole(m.role),
                content: formatMessageForAgent(m),
              })),
          ];

          let assistantReply = "";
          const completion = await runAgentCompletionStream({
            model: models.overseerModel,
            messages: completionMessages,
            requestId,
            operation: "overseer-stream",
            signal: localAbortController.signal,
            onDelta: (delta) => {
              assistantReply += delta;
              send("delta", { text: delta });
            },
          });

          if (isAborted) return;

          const trimmedReply = assistantReply.trim();
          let storedAssistantMessageId: string | null = null;
          if (trimmedReply.length > 0) {
            const storedAssistantMessage = await appendOverseerMessage(
              coachUserId,
              "assistant",
              trimmedReply,
              {
                clientId,
                source: "AI",
                meta: {
                  responseId: completion.responseId,
                  usage: completion.usage,
                },
              }
            );
            storedAssistantMessageId = storedAssistantMessage.id;
          }

          send("done", {
            requestId,
            userMessageId: storedUserMessage.id,
            assistantMessageId: storedAssistantMessageId,
          });

          logInfo("api.overseer.stream.end", {
            requestId,
            route,
            method: "POST",
            userId: coachUserId,
            messageLength: message.length,
            replyLength: trimmedReply.length,
            status: 200,
            durationMs: Date.now() - startedAt,
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
                ? "Overzichtscoach reageerde niet binnen de ingestelde tijd."
                : isRateLimit
                ? "Overzichtscoach is tijdelijk druk. Probeer het over enkele seconden opnieuw."
                : "Overzichtscoach is tijdelijk niet bereikbaar.",
              requestId,
            });

            logError("api.overseer.stream.error", {
              requestId,
              route,
              method: "POST",
              userId: coachUserId,
              status: isTimeout ? 504 : isRateLimit ? 429 : 500,
              durationMs,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            });
          }
        } finally {
          request.signal.removeEventListener("abort", onRequestAbort);
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "x-request-id": requestId,
    },
  });
}
