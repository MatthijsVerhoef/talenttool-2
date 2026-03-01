import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DocumentExtractionStatus } from "@prisma/client";
import JSZip from "jszip";

import { extractPdfTextFromBuffer, transcribeAudio } from "@/lib/ai/openai";

const DOCUMENT_CONTENT_MAX_CHARS = Number(process.env.DOCUMENT_CONTENT_MAX_CHARS ?? "0");

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

  try {
    if (isAudio) {
      return await extractAudioContent(input.buffer, input.fileName, mimeType);
    }

    if (isPdf) {
      const extracted = await extractPdfTextFromBuffer(input.buffer, {
        requestId: input.requestId,
        fileName: input.fileName,
      });
      const content = trimContent(extracted);
      if (!content) {
        return {
          kind: "TEXT",
          extractionStatus: DocumentExtractionStatus.FAILED,
          extractionError: "PDF bevat geen extraheerbare tekst.",
          extractedAt: new Date(),
        };
      }
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
        return {
          kind: "TEXT",
          extractionStatus: DocumentExtractionStatus.FAILED,
          extractionError: "DOCX tekstextractie gaf geen resultaat.",
          extractedAt: new Date(),
        };
      }
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
        return {
          kind: "TEXT",
          extractionStatus: DocumentExtractionStatus.FAILED,
          extractionError: "Tekstbestand bevat geen leesbare inhoud.",
          extractedAt: new Date(),
        };
      }
      return {
        kind: "TEXT",
        content,
        extractionStatus: DocumentExtractionStatus.READY,
        extractedAt: new Date(),
      };
    }

    return {
      kind: "TEXT",
      extractionStatus: DocumentExtractionStatus.PENDING,
      extractedAt: null,
    };
  } catch (error) {
    return {
      kind: isAudio ? "AUDIO" : "TEXT",
      extractionStatus: DocumentExtractionStatus.FAILED,
      extractionError:
        error instanceof Error ? sanitizeErrorMessage(error.message) : "Extractie mislukt.",
      extractedAt: new Date(),
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
