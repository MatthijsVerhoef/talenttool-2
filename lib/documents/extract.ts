import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DocumentExtractionStatus } from "@prisma/client";
import JSZip from "jszip";
import pdfParse from "pdf-parse";

import { extractPdfTextFromBuffer, transcribeAudio } from "@/lib/ai/openai";
import { logError, logInfo } from "@/lib/observability";

const DOCUMENT_CONTENT_MAX_CHARS = Number(process.env.DOCUMENT_CONTENT_MAX_CHARS ?? "0");
const PDF_LOCAL_EXTRACT_MIN_CHARS = Number(
  process.env.PDF_LOCAL_EXTRACT_MIN_CHARS ?? "80",
);

export interface ExtractDocumentContentResult {
  kind: "TEXT" | "AUDIO";
  content?: string;
  audioDuration?: number;
  extractionStatus: DocumentExtractionStatus;
  extractionError?: string | null;
  extractedAt: Date | null;
}

interface ExtractDocumentContentInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  requestId?: string;
}

export async function extractDocumentContent(
  input: ExtractDocumentContentInput,
): Promise<ExtractDocumentContentResult> {
  const mimeType = input.mimeType || "application/octet-stream";
  const isAudio = isAudioFile(input.fileName, mimeType);
  const isPdf = isPdfFile(input.fileName, mimeType);
  const isDocx = isDocxFile(input.fileName, mimeType);
  const startedAt = Date.now();

  logInfo("documents.extractor.start", {
    requestId: input.requestId ?? null,
    fileName: input.fileName,
    mimeType,
    bytes: input.buffer.byteLength,
    isAudio,
    isPdf,
    isDocx,
  });

  try {
    if (isAudio) {
      const result = await extractAudioContent(input.buffer, input.fileName, mimeType);
      logInfo("documents.extractor.end", {
        requestId: input.requestId ?? null,
        fileName: input.fileName,
        mimeType,
        branch: "audio",
        status: result.extractionStatus,
        contentChars: result.content?.length ?? 0,
        audioDuration: result.audioDuration ?? null,
        error: result.extractionError ?? null,
        durationMs: Date.now() - startedAt,
      });
      return result;
    }

    if (isPdf) {
      const localPdfExtraction = await tryExtractPdfTextLocally(
        input.buffer,
        input.fileName,
        input.requestId,
      );
      if (localPdfExtraction.content) {
        logInfo("documents.extractor.end", {
          requestId: input.requestId ?? null,
          fileName: input.fileName,
          mimeType,
          branch: "pdf",
          source: "local",
          status: DocumentExtractionStatus.READY,
          rawChars: localPdfExtraction.rawChars,
          contentChars: localPdfExtraction.content.length,
          numPages: localPdfExtraction.numPages,
          error: null,
          durationMs: Date.now() - startedAt,
        });
        return {
          kind: "TEXT",
          content: localPdfExtraction.content,
          extractionStatus: DocumentExtractionStatus.READY,
          extractedAt: new Date(),
        };
      }

      const extracted = await extractPdfTextFromBuffer(input.buffer, {
        requestId: input.requestId,
        fileName: input.fileName,
      });
      const content = trimContent(extracted);
      if (!content) {
        logInfo("documents.extractor.end", {
          requestId: input.requestId ?? null,
          fileName: input.fileName,
          mimeType,
          branch: "pdf",
          source: "openai-fallback",
          status: DocumentExtractionStatus.FAILED,
          rawChars: extracted.length,
          contentChars: 0,
          error: "PDF bevat geen extraheerbare tekst.",
          durationMs: Date.now() - startedAt,
        });
        return {
          kind: "TEXT",
          extractionStatus: DocumentExtractionStatus.FAILED,
          extractionError: "PDF bevat geen extraheerbare tekst.",
          extractedAt: new Date(),
        };
      }
      logInfo("documents.extractor.end", {
        requestId: input.requestId ?? null,
        fileName: input.fileName,
        mimeType,
        branch: "pdf",
        source: "openai-fallback",
        status: DocumentExtractionStatus.READY,
        rawChars: extracted.length,
        contentChars: content.length,
        error: null,
        durationMs: Date.now() - startedAt,
      });
      return {
        kind: "TEXT",
        content,
        extractionStatus: DocumentExtractionStatus.READY,
        extractedAt: new Date(),
      };
    }

    if (isDocx) {
      const extracted = await extractDocxText(input.buffer);
      const content = trimContent(extracted);
      if (!content) {
        logInfo("documents.extractor.end", {
          requestId: input.requestId ?? null,
          fileName: input.fileName,
          mimeType,
          branch: "docx",
          status: DocumentExtractionStatus.FAILED,
          rawChars: extracted?.length ?? 0,
          contentChars: 0,
          error: "DOCX tekstextractie gaf geen resultaat.",
          durationMs: Date.now() - startedAt,
        });
        return {
          kind: "TEXT",
          extractionStatus: DocumentExtractionStatus.FAILED,
          extractionError: "DOCX tekstextractie gaf geen resultaat.",
          extractedAt: new Date(),
        };
      }
      logInfo("documents.extractor.end", {
        requestId: input.requestId ?? null,
        fileName: input.fileName,
        mimeType,
        branch: "docx",
        status: DocumentExtractionStatus.READY,
        rawChars: extracted?.length ?? 0,
        contentChars: content.length,
        error: null,
        durationMs: Date.now() - startedAt,
      });
      return {
        kind: "TEXT",
        content,
        extractionStatus: DocumentExtractionStatus.READY,
        extractedAt: new Date(),
      };
    }

    if (shouldStoreContent(mimeType, input.fileName)) {
      const content = trimContent(input.buffer.toString("utf-8"));
      if (!content) {
        logInfo("documents.extractor.end", {
          requestId: input.requestId ?? null,
          fileName: input.fileName,
          mimeType,
          branch: "text",
          status: DocumentExtractionStatus.FAILED,
          contentChars: 0,
          error: "Tekstbestand bevat geen leesbare inhoud.",
          durationMs: Date.now() - startedAt,
        });
        return {
          kind: "TEXT",
          extractionStatus: DocumentExtractionStatus.FAILED,
          extractionError: "Tekstbestand bevat geen leesbare inhoud.",
          extractedAt: new Date(),
        };
      }
      logInfo("documents.extractor.end", {
        requestId: input.requestId ?? null,
        fileName: input.fileName,
        mimeType,
        branch: "text",
        status: DocumentExtractionStatus.READY,
        contentChars: content.length,
        error: null,
        durationMs: Date.now() - startedAt,
      });
      return {
        kind: "TEXT",
        content,
        extractionStatus: DocumentExtractionStatus.READY,
        extractedAt: new Date(),
      };
    }

    logInfo("documents.extractor.end", {
      requestId: input.requestId ?? null,
      fileName: input.fileName,
      mimeType,
      branch: "unsupported",
      status: DocumentExtractionStatus.PENDING,
      contentChars: 0,
      error: null,
      durationMs: Date.now() - startedAt,
    });
    return {
      kind: "TEXT",
      extractionStatus: DocumentExtractionStatus.PENDING,
      extractedAt: null,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? sanitizeErrorMessage(error.message) : "Extractie mislukt.";
    logError("documents.extractor.error", {
      requestId: input.requestId ?? null,
      fileName: input.fileName,
      mimeType,
      isAudio,
      isPdf,
      isDocx,
      durationMs: Date.now() - startedAt,
      errorMessage,
    });
    return {
      kind: isAudio ? "AUDIO" : "TEXT",
      extractionStatus: DocumentExtractionStatus.FAILED,
      extractionError: errorMessage,
      extractedAt: new Date(),
    };
  }
}

async function tryExtractPdfTextLocally(
  buffer: Buffer,
  fileName: string,
  requestId?: string,
): Promise<{ content?: string; rawChars: number; numPages: number | null }> {
  try {
    const parsed = await pdfParse(buffer);
    const rawText = parsed.text ?? "";
    const trimmedText = trimContent(rawText);
    const minChars = Number.isFinite(PDF_LOCAL_EXTRACT_MIN_CHARS)
      ? Math.max(20, Math.floor(PDF_LOCAL_EXTRACT_MIN_CHARS))
      : 80;
    const content =
      trimmedText && trimmedText.trim().length >= minChars ? trimmedText : undefined;

    logInfo("documents.extractor.pdf.local", {
      requestId: requestId ?? null,
      fileName,
      rawChars: rawText.length,
      trimmedChars: trimmedText?.length ?? 0,
      minChars,
      numPages: typeof parsed.numpages === "number" ? parsed.numpages : null,
      used: Boolean(content),
    });

    return {
      content,
      rawChars: rawText.length,
      numPages: typeof parsed.numpages === "number" ? parsed.numpages : null,
    };
  } catch (error) {
    logError("documents.extractor.pdf.local_error", {
      requestId: requestId ?? null,
      fileName,
      errorMessage: error instanceof Error ? sanitizeErrorMessage(error.message) : String(error),
    });
    return {
      content: undefined,
      rawChars: 0,
      numPages: null,
    };
  }
}

async function extractAudioContent(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractDocumentContentResult> {
  const tempPath = path.join(os.tmpdir(), `${Date.now()}-${fileName.replace(/\s+/g, "_")}`);
  await writeFile(tempPath, buffer);
  try {
    const transcription = await transcribeAudio(tempPath, mimeType);
    const content = trimContent(transcription.text?.trim() || undefined);
    if (!content) {
      return {
        kind: "AUDIO",
        extractionStatus: DocumentExtractionStatus.FAILED,
        extractionError: "Audio transcriptie gaf geen tekst terug.",
        audioDuration: transcription.duration,
        extractedAt: new Date(),
      };
    }
    return {
      kind: "AUDIO",
      content,
      audioDuration: transcription.duration,
      extractionStatus: DocumentExtractionStatus.READY,
      extractedAt: new Date(),
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

async function extractDocxText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const mainDocument = zip.file("word/document.xml");
  if (!mainDocument) {
    return undefined;
  }
  const xml = await mainDocument.async("text");
  return normalizeDocxText(xml);
}

function normalizeDocxText(xml: string) {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimContent(input?: string) {
  if (!input) {
    return undefined;
  }
  if (DOCUMENT_CONTENT_MAX_CHARS > 0) {
    return input.slice(0, DOCUMENT_CONTENT_MAX_CHARS);
  }
  return input;
}

function shouldStoreContent(mimeType: string, fileName: string) {
  if (mimeType?.startsWith("text/") || mimeType === "application/json") {
    return true;
  }
  return /\.(md|txt|json|csv)$/i.test(fileName);
}

function isDocxFile(fileName: string, mimeType?: string) {
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return true;
  }
  return /\.docx$/i.test(fileName);
}

function isPdfFile(fileName: string, mimeType?: string) {
  if (mimeType === "application/pdf") {
    return true;
  }
  return /\.pdf$/i.test(fileName);
}

function isAudioFile(fileName: string, mimeType?: string) {
  if (mimeType?.startsWith("audio/")) {
    return true;
  }
  return /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(fileName);
}

function sanitizeErrorMessage(message: string) {
  return message.length > 300 ? `${message.slice(0, 300)}...` : message;
}
