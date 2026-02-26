import fs from "node:fs";

import OpenAI from "openai";
import { logError, logInfo } from "@/lib/observability";

type ChatRole = "user" | "assistant" | "system";

let client: OpenAI | null = null;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? "45000");
const OPENAI_STALL_MS = Number(process.env.OPENAI_STALL_MS ?? "0");

export class OpenAITimeoutError extends Error {
  readonly timeoutMs: number;
  readonly operation?: string;

  constructor(timeoutMs: number, operation?: string) {
    super(
      operation
        ? `OpenAI request timed out after ${timeoutMs}ms during ${operation}`
        : `OpenAI request timed out after ${timeoutMs}ms`,
    );
    this.name = "OpenAITimeoutError";
    this.timeoutMs = timeoutMs;
    this.operation = operation;
  }
}

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY environment variable. Add it to your .env.local file.",
    );
  }
  return new OpenAI({ apiKey });
}

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = createClient();
  }
  return client;
}

export interface RunAgentOptions {
  model: string;
  messages: { role: ChatRole; content: string }[];
  temperature?: number;
  requestId?: string;
  operation?: string;
  timeoutMs?: number;
}

export interface AgentRunResult {
  outputText: string;
  responseId: string;
  usage?: {
    totalTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
}

export async function runAgentCompletion(
  options: RunAgentOptions,
): Promise<AgentRunResult> {
  const client = getOpenAIClient();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Number(options.timeoutMs))
    : OPENAI_TIMEOUT_MS;

  const systemContent = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .filter((content) => content.trim().length > 0)
    .join("\n\n");

  const conversation: OpenAI.Responses.ResponseInput = [
    ...(systemContent.length
      ? [
          {
            role: "system" as const,
            content: systemContent,
          },
        ]
      : []),
    ...options.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ].filter((entry) => typeof entry.content === "string" && entry.content.trim().length > 0);

  const requestPayload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: options.model,
    input: conversation,
  };
  if (typeof options.temperature === "number") {
    requestPayload.temperature = options.temperature;
  }

  logInfo("openai.start", {
    requestId: options.requestId ?? null,
    operation: options.operation ?? null,
    model: options.model,
    timeoutMs,
    inputMessageCount: options.messages.length,
    inputCharCount: options.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    ),
  });

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    await maybeStall(controller.signal);
    const response = await client.responses.create(requestPayload, {
      signal: controller.signal,
    });
    const outputText = extractText(response);
    const durationMs = Date.now() - startedAt;

    logInfo("openai.success", {
      requestId: options.requestId ?? null,
      operation: options.operation ?? null,
      model: options.model,
      durationMs,
      responseId: response.id,
      totalTokens: response.usage?.total_tokens,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      outputCharCount: outputText.length,
    });

    return {
      outputText,
      responseId: response.id,
      usage: {
        totalTokens: response.usage?.total_tokens,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      const timeoutError = new OpenAITimeoutError(timeoutMs, options.operation);
      logError("openai.timeout", {
        requestId: options.requestId ?? null,
        operation: options.operation ?? null,
        model: options.model,
        timeoutMs,
        durationMs,
      });
      throw timeoutError;
    }

    logError("openai.error", {
      requestId: options.requestId ?? null,
      operation: options.operation ?? null,
      model: options.model,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function transcribeAudio(
  filePath: string,
  mimeType?: string,
): Promise<{ text: string; duration?: number }> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, OPENAI_TIMEOUT_MS);

  logInfo("openai.start", {
    requestId: null,
    operation: "transcribe",
    model,
    timeoutMs: OPENAI_TIMEOUT_MS,
    inputMimeType: mimeType ?? null,
  });

  try {
    await maybeStall(controller.signal);
    const response = await client.audio.transcriptions.create(
      {
        file: fs.createReadStream(filePath),
        model,
        response_format: "verbose_json",
      },
      {
        signal: controller.signal,
      },
    );

    const durationMs = Date.now() - startedAt;
    logInfo("openai.success", {
      requestId: null,
      operation: "transcribe",
      model,
      durationMs,
      outputCharCount: (response.text ?? "").length,
    });

    return {
      text: response.text ?? "",
      duration: typeof response.duration === "number" ? response.duration : undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      const timeoutError = new OpenAITimeoutError(OPENAI_TIMEOUT_MS, "transcribe");
      logError("openai.timeout", {
        requestId: null,
        operation: "transcribe",
        model,
        timeoutMs: OPENAI_TIMEOUT_MS,
        durationMs,
      });
      throw timeoutError;
    }

    logError("openai.error", {
      requestId: null,
      operation: "transcribe",
      model,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function maybeStall(signal: AbortSignal) {
  if (!Number.isFinite(OPENAI_STALL_MS) || OPENAI_STALL_MS <= 0) {
    return;
  }

  await waitWithAbort(Math.max(1, Math.floor(OPENAI_STALL_MS)), signal);
}

function waitWithAbort(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Aborted"));
    };

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function extractText(response: OpenAI.Responses.Response) {
  const outputText = response.output_text as string | string[] | undefined;
  if (typeof outputText === "string") {
    return outputText.trim();
  }
  if (Array.isArray(outputText) && outputText.length > 0) {
    return outputText.join("\n").trim();
  }

  if (!response.output) {
    return "";
  }

  return (
    response.output
      .map((item) => {
        if (!("content" in item)) {
          return "";
        }
        return (
          item.content
            ?.map((contentItem) => getContentText(contentItem))
            .filter(Boolean)
            .join(" ") ?? ""
        );
      })
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

function getContentText(contentItem: unknown) {
  if (!contentItem) {
    return "";
  }
  const item = contentItem as { type?: string; text?: unknown };
  switch (item.type) {
    case "output_text":
    case "input_text":
      return typeof item.text === "string" ? item.text : "";
    case "text":
      if (typeof item.text === "string") {
        return item.text;
      }
      return (item.text as { value?: string })?.value ?? "";
    default:
      return "";
  }
}
