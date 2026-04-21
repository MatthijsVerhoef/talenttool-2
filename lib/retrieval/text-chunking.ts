const DOCUMENT_CHUNK_SIZE_CHARS = Number(
  process.env.DOCUMENT_CHUNK_SIZE_CHARS ?? "1000"
);
const DOCUMENT_CHUNK_OVERLAP_CHARS = Number(
  process.env.DOCUMENT_CHUNK_OVERLAP_CHARS ?? "120"
);

export function clampPositiveInt(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function splitDocumentIntoChunks(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunkSize = clampPositiveInt(DOCUMENT_CHUNK_SIZE_CHARS, 1000);
  const overlap = Math.min(
    clampPositiveInt(DOCUMENT_CHUNK_OVERLAP_CHARS, 120),
    Math.max(0, chunkSize - 1)
  );
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    let end = Math.min(cursor + chunkSize, normalized.length);
    if (end < normalized.length) {
      const breakRegionStart = Math.max(cursor, end - 180);
      const breakRegion = normalized.slice(breakRegionStart, end);
      const lastBreak = Math.max(
        breakRegion.lastIndexOf("\n"),
        breakRegion.lastIndexOf(". ")
      );
      if (lastBreak > 0) {
        end = breakRegionStart + lastBreak + 1;
      }
    }

    const chunk = normalized.slice(cursor, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    const nextCursor = Math.max(end - overlap, cursor + 1);
    cursor = nextCursor;
  }

  return chunks;
}

export function buildQueryTerms(input: string) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "een",
    "het",
    "van",
    "met",
    "voor",
    "aan",
    "zijn",
    "haar",
    "deze",
    "over",
  ]);

  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9À-ɏ]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !stopWords.has(term))
    )
  );
}

export function countOccurrences(text: string, term: string) {
  let count = 0;
  let fromIndex = 0;
  while (true) {
    const index = text.indexOf(term, fromIndex);
    if (index < 0) {
      return count;
    }
    count += 1;
    fromIndex = index + term.length;
  }
}
