export class TranscribeRequestError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = "TranscribeRequestError";
    this.status = status;
    this.requestId = requestId;
  }
}

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("x-m4a")) return "m4a";
  if (normalized.includes("mp4")) return "mp4";
  return "webm";
}

export async function transcribe(
  blob: Blob,
  opts: {
    language?: string;
    requestId: string;
    signal?: AbortSignal;
  },
): Promise<{ text: string; requestId: string }> {
  const mimeType = blob.type || "audio/webm";
  const extension = extensionFromMimeType(mimeType);
  const file = new File([blob], `recording-${Date.now()}.${extension}`, {
    type: mimeType,
  });

  const form = new FormData();
  form.append("file", file);
  if (opts.language?.trim()) {
    form.append("language", opts.language.trim().toLowerCase());
  }

  const response = await fetch("/api/audio/transcribe", {
    method: "POST",
    credentials: "include",
    headers: {
      "x-request-id": opts.requestId,
    },
    body: form,
    signal: opts.signal,
  });

  const responseRequestId =
    response.headers.get("x-request-id") ?? opts.requestId;
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : "Transcriptie is mislukt.";
    throw new TranscribeRequestError(
      `${message} (requestId: ${responseRequestId})`,
      response.status,
      responseRequestId,
    );
  }

  const text = typeof payload.text === "string" ? payload.text : "";
  return {
    text,
    requestId: responseRequestId,
  };
}
