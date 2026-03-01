import { NextResponse } from "next/server";

import { transcribeAudio } from "@/lib/ai/transcribe";
import { OpenAITimeoutError } from "@/lib/ai/openai";
import {
  SessionGuardError,
  requireAuthenticatedSession,
} from "@/lib/auth-guards";
import { HttpError, isHttpError } from "@/lib/http/errors";
import { getRequestId, logError, logInfo } from "@/lib/observability";
import {
  normalizeTranscribeLanguage,
  validateTranscribeFile,
} from "@/lib/validation/audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonWithRequestId(
  requestId: string,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("x-request-id", requestId);
  return response;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const route = "/api/audio/transcribe";
  const startedAt = Date.now();
  let userId: string | null = null;

  try {
    const session = await requireAuthenticatedSession(request, requestId);
    userId = session.userId;

    const form = await request.formData();
    const fileEntry = form.get("file");
    if (!(fileEntry instanceof File)) {
      throw new HttpError(400, "Audiobestand ontbreekt.", "missing_file");
    }

    const language = normalizeTranscribeLanguage(form.get("language"));
    validateTranscribeFile(fileEntry);

    logInfo("transcribe.start", {
      requestId,
      userId,
      route,
      bytes: fileEntry.size,
      mime: fileEntry.type || null,
      language: language ?? null,
    });

    const { text } = await transcribeAudio({
      file: fileEntry,
      language,
      requestId,
    });

    const durationMs = Date.now() - startedAt;
    logInfo("transcribe.success", {
      requestId,
      userId,
      route,
      chars: text.length,
      durationMs,
    });

    return jsonWithRequestId(requestId, { text, requestId });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    let status = 500;
    let message = "Transcriptie is mislukt.";

    if (error instanceof SessionGuardError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof OpenAITimeoutError) {
      status = 504;
      message = "Transcriptie reageerde niet binnen de ingestelde tijd.";
    } else if (isHttpError(error)) {
      status = error.status;
      message = error.message;
    }

    logError("transcribe.error", {
      requestId,
      userId,
      route,
      code: status,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return jsonWithRequestId(
      requestId,
      {
        error: message,
        requestId,
      },
      { status },
    );
  }
}
