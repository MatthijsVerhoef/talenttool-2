import { HttpError } from "@/lib/http/errors";

const DEFAULT_TRANSCRIBE_MAX_BYTES = 10_000_000;
const DEFAULT_TRANSCRIBE_MAX_SECONDS = 60;

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
]);

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  "webm",
  "ogg",
  "wav",
  "mp3",
  "mp4",
  "m4a",
]);

const ALLOWED_LANGUAGES = new Set(["nl", "en"]);

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeMimeType(mimeType: string) {
  return mimeType.trim().toLowerCase();
}

function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  if (index <= 0 || index === normalized.length - 1) {
    return null;
  }
  return normalized.slice(index + 1);
}

export function getTranscribeMaxBytes() {
  return parsePositiveInt(
    process.env.TRANSCRIBE_MAX_BYTES,
    DEFAULT_TRANSCRIBE_MAX_BYTES,
  );
}

export function getTranscribeMaxSeconds() {
  return parsePositiveInt(
    process.env.TRANSCRIBE_MAX_SECONDS,
    DEFAULT_TRANSCRIBE_MAX_SECONDS,
  );
}

export function normalizeTranscribeLanguage(
  value: FormDataEntryValue | null,
): "nl" | "en" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (!ALLOWED_LANGUAGES.has(normalized)) {
    throw new HttpError(400, "Taal moet 'nl' of 'en' zijn.", "invalid_language");
  }
  return normalized as "nl" | "en";
}

export function validateTranscribeFile(file: File) {
  if (!file || file.size <= 0) {
    throw new HttpError(400, "Audiobestand ontbreekt.", "missing_file");
  }

  const maxBytes = getTranscribeMaxBytes();
  if (file.size > maxBytes) {
    throw new HttpError(
      413,
      `Audiobestand is te groot (max ${maxBytes} bytes).`,
      "file_too_large",
    );
  }

  const mimeType = normalizeMimeType(file.type || "");
  if (!mimeType) {
    throw new HttpError(415, "Audiotype ontbreekt.", "missing_mime_type");
  }

  const mimeBase = mimeType.split(";")[0]?.trim() ?? "";
  const allowedMime =
    ALLOWED_AUDIO_MIME_TYPES.has(mimeType) || ALLOWED_AUDIO_MIME_TYPES.has(mimeBase);
  if (!allowedMime) {
    throw new HttpError(
      415,
      "Bestandstype wordt niet ondersteund voor transcriptie.",
      "unsupported_mime_type",
    );
  }

  const extension = getFileExtension(file.name ?? "");
  if (extension && !ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    throw new HttpError(
      415,
      "Bestandsextensie wordt niet ondersteund voor transcriptie.",
      "unsupported_file_extension",
    );
  }
}
