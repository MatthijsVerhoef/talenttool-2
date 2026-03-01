import fs from "node:fs";

import OpenAI from "openai";
import { logError, logInfo } from "@/lib/observability";

type ChatRole = "user" | "assistant" | "system";

let client: OpenAI | null = null;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? "45000");
const OPENAI_STALL_MS = Number(process.env.OPENAI_STALL_MS ?? "0");
const OPENAI_PDF_EXTRACT_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_PDF_EXTRACT_MAX_OUTPUT_TOKENS ?? "12000",
);

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

export class OpenAIRateLimitError extends Error {
  readonly retryAfterMs?: number;
  readonly operation?: string;

  constructor(retryAfterMs?: number, operation?: string) {
    super(
      operation
        ? `OpenAI rate limit reached during ${operation}`
        : "OpenAI rate limit reached",
    );
    this.name = "OpenAIRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.operation = operation;
  }
}

function getErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

function getRetryAfterMs(error: unknown): number | undefined {
  const headers = (error as { headers?: unknown } | null)?.headers as
    | { get?: (key: string) => string | null | undefined; [key: string]: unknown }
    | undefined;
  const rawHeader =
    (headers && typeof headers.get === "function"
      ? headers.get("retry-after")
      : (headers?.["retry-after"] as string | undefined)) ?? undefined;
  if (rawHeader) {
    const seconds = Number(rawHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.round(seconds * 1000);
    }
  }

  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string") {
    const msMatch = message.match(/try again in\s+(\d+)\s*ms/i);
    if (msMatch && msMatch[1]) {
      const parsed = Number(msMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return undefined;
}

function isRateLimitError(error: unknown): boolean {
  if (getErrorStatus(error) === 429) {
    return true;
  }
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string") {
    return message.toLowerCase().includes("rate limit");
  }
  return false;
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

export interface RunAgentStreamOptions extends RunAgentOptions {
  onDelta: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
}

function resolveTimeoutMs(timeoutMs?: number) {
  return Number.isFinite(timeoutMs)
    ? Math.max(1, Number(timeoutMs))
    : OPENAI_TIMEOUT_MS;
}

function buildConversation(messages: { role: ChatRole; content: string }[]) {
  const systemContent = messages
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
    ...messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
  ].filter(
    (entry) => typeof entry.content === "string" && entry.content.trim().length > 0,
  );

  return conversation;
}

function buildRequestPayload(options: RunAgentOptions) {
  const requestPayload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: options.model,
    input: buildConversation(options.messages),
  };
  if (typeof options.temperature === "number") {
    requestPayload.temperature = options.temperature;
  }
  return requestPayload;
}

export async function runAgentCompletion(
  options: RunAgentOptions,
): Promise<AgentRunResult> {
  const client = getOpenAIClient();
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const requestPayload = buildRequestPayload(options);

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

    if (isRateLimitError(error)) {
      const retryAfterMs = getRetryAfterMs(error);
      const rateLimitError = new OpenAIRateLimitError(retryAfterMs, options.operation);
      logError("openai.rate_limit", {
        requestId: options.requestId ?? null,
        operation: options.operation ?? null,
        model: options.model,
        durationMs,
        retryAfterMs: retryAfterMs ?? null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw rateLimitError;
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

export async function runAgentCompletionStream(
  options: RunAgentStreamOptions,
): Promise<AgentRunResult> {
  const client = getOpenAIClient();
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const requestPayload = buildRequestPayload(options);

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
    stream: true,
  });

  const startedAt = Date.now();
  let timedOut = false;
  let abortedByCaller = false;
  let fullText = "";
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let abortActiveStream: (() => void) | null = null;

  const onCallerAbort = () => {
    abortedByCaller = true;
    abortActiveStream?.();
  };
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    await maybeStall(options.signal ?? new AbortController().signal);
    const streamParams =
      requestPayload as unknown as Parameters<typeof client.responses.stream>[0];
    const stream = client.responses.stream(streamParams);
    abortActiveStream = () => stream.abort();
    if (options.signal?.aborted) {
      abortedByCaller = true;
      stream.abort();
    }
    timeout = setTimeout(() => {
      timedOut = true;
      stream.abort();
    }, timeoutMs);

    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) {
        fullText += event.delta;
        await options.onDelta(event.delta);
      }
    }

    const response = await stream.finalResponse();
    const outputText = fullText.trim();
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
      stream: true,
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
    if (timedOut) {
      const timeoutError = new OpenAITimeoutError(timeoutMs, options.operation);
      logError("openai.timeout", {
        requestId: options.requestId ?? null,
        operation: options.operation ?? null,
        model: options.model,
        timeoutMs,
        durationMs,
        stream: true,
      });
      throw timeoutError;
    }

    if (abortedByCaller || options.signal?.aborted) {
      throw new Error("Aborted");
    }

    if (isRateLimitError(error)) {
      const retryAfterMs = getRetryAfterMs(error);
      const rateLimitError = new OpenAIRateLimitError(retryAfterMs, options.operation);
      logError("openai.rate_limit", {
        requestId: options.requestId ?? null,
        operation: options.operation ?? null,
        model: options.model,
        durationMs,
        retryAfterMs: retryAfterMs ?? null,
        errorMessage: error instanceof Error ? error.message : String(error),
        stream: true,
      });
      throw rateLimitError;
    }

    logError("openai.error", {
      requestId: options.requestId ?? null,
      operation: options.operation ?? null,
      model: options.model,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
      stream: true,
    });
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    options.signal?.removeEventListener("abort", onCallerAbort);
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

export async function extractPdfTextFromBuffer(
  buffer: Buffer,
  options?: {
    requestId?: string;
    fileName?: string;
    timeoutMs?: number;
  },
): Promise<string> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_PDF_EXTRACT_MODEL ?? "gpt-4o-mini";
  const timeoutMs = resolveTimeoutMs(options?.timeoutMs);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  logInfo("openai.start", {
    requestId: options?.requestId ?? null,
    operation: "extract-pdf",
    model,
    timeoutMs,
    inputBytes: buffer.byteLength,
  });

  try {
    await maybeStall(controller.signal);
    const fileData = `data:application/pdf;base64,${buffer.toString("base64")}`;
    const response = await client.responses.create(
      {
        model,
        max_output_tokens: Math.max(
          1000,
          Math.floor(OPENAI_PDF_EXTRACT_MAX_OUTPUT_TOKENS),
        ),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Extract ALL readable text from this PDF as plain UTF-8 text.",
                  "Return full text from all pages; do not summarize.",
                  "Preserve headings, bullet points, and line breaks where possible.",
                  "If text is unclear, keep best-effort OCR output instead of omitting.",
                ].join(" "),
              },
              {
                type: "input_file",
                filename: options?.fileName ?? "document.pdf",
                file_data: fileData,
              },
            ],
          },
        ],
      } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming,
      {
        signal: controller.signal,
      },
    );

    const outputText = extractText(response);
    const durationMs = Date.now() - startedAt;
    logInfo("openai.success", {
      requestId: options?.requestId ?? null,
      operation: "extract-pdf",
      model,
      durationMs,
      outputCharCount: outputText.length,
    });

    return outputText;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (controller.signal.aborted) {
      const timeoutError = new OpenAITimeoutError(timeoutMs, "extract-pdf");
      logError("openai.timeout", {
        requestId: options?.requestId ?? null,
        operation: "extract-pdf",
        model,
        timeoutMs,
        durationMs,
      });
      throw timeoutError;
    }

    logError("openai.error", {
      requestId: options?.requestId ?? null,
      operation: "extract-pdf",
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
