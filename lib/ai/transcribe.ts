import { OpenAITimeoutError, getOpenAIClient } from "@/lib/ai/openai";
import { logError, logInfo } from "@/lib/observability";

const OPENAI_TRANSCRIBE_TIMEOUT_MS = Number(
  process.env.OPENAI_TRANSCRIBE_TIMEOUT_MS ?? "45000",
);

function getTranscribeModel() {
  return process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";
}

export async function transcribeAudio(options: {
  file: File;
  language?: "nl" | "en";
  requestId?: string;
  signal?: AbortSignal;
}): Promise<{ text: string }> {
  const client = getOpenAIClient();
  const model = getTranscribeModel();
  const timeoutMs = Number.isFinite(OPENAI_TRANSCRIBE_TIMEOUT_MS)
    ? Math.max(1, OPENAI_TRANSCRIBE_TIMEOUT_MS)
    : 45000;

  const startedAt = Date.now();
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs);

  const onCallerAbort = () => {
    timeoutController.abort();
  };
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });

  logInfo("openai.start", {
    requestId: options.requestId ?? null,
    operation: "transcribe",
    model,
    timeoutMs,
    inputMimeType: options.file.type || null,
    inputBytes: options.file.size,
    language: options.language ?? null,
  });

  try {
    const response = await client.audio.transcriptions.create(
      {
        file: options.file,
        model,
        ...(options.language ? { language: options.language } : {}),
      },
      {
        signal: timeoutController.signal,
      },
    );

    const text = (response.text ?? "").trim();
    const durationMs = Date.now() - startedAt;
    logInfo("openai.success", {
      requestId: options.requestId ?? null,
      operation: "transcribe",
      model,
      durationMs,
      outputCharCount: text.length,
    });

    return { text };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (timeoutController.signal.aborted) {
      if (options.signal?.aborted) {
        throw new Error("Aborted");
      }
      const timeoutError = new OpenAITimeoutError(timeoutMs, "transcribe");
      logError("openai.timeout", {
        requestId: options.requestId ?? null,
        operation: "transcribe",
        model,
        timeoutMs,
        durationMs,
      });
      throw timeoutError;
    }

    logError("openai.error", {
      requestId: options.requestId ?? null,
      operation: "transcribe",
      model,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onCallerAbort);
  }
}
