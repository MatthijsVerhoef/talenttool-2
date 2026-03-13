import { Buffer } from "node:buffer";

import { put, del } from "@vercel/blob";

const BLOB_RW_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const ENABLE_INLINE_BLOB_FALLBACK =
  process.env.BLOB_INLINE_FALLBACK !== "0" && process.env.NODE_ENV !== "production";

export interface BlobUploadResult {
  url: string;
  pathname?: string;
  contentType?: string;
}

export async function uploadToBlob(
  key: string,
  data: ArrayBuffer | Uint8Array | Blob | Buffer,
  contentType?: string,
): Promise<BlobUploadResult> {
  if (!BLOB_RW_TOKEN) {
    if (!ENABLE_INLINE_BLOB_FALLBACK) {
      throw new Error("Missing BLOB_READ_WRITE_TOKEN environment variable.");
    }
    const buffer = await ensureBuffer(data);
    const resolvedContentType = contentType ?? "application/octet-stream";
    return {
      url: `data:${resolvedContentType};base64,${buffer.toString("base64")}`,
      contentType: resolvedContentType,
    };
  }

  const blob = await put(
    key,
    await ensureBuffer(data),
    {
      access: "public",
      contentType: contentType ?? "application/octet-stream",
      token: BLOB_RW_TOKEN,
    },
  );
  

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType,
  };
}

export async function deleteFromBlob(urls: string | string[]): Promise<void> {
  if (!BLOB_RW_TOKEN) {
    if (!ENABLE_INLINE_BLOB_FALLBACK) {
      throw new Error("Missing BLOB_READ_WRITE_TOKEN environment variable.");
    }

    const values = Array.isArray(urls) ? urls : [urls];
    const hasNonDataUrl = values.some((value) => !value.trim().startsWith("data:"));
    if (hasNonDataUrl) {
      throw new Error("Missing BLOB_READ_WRITE_TOKEN environment variable.");
    }
    return;
  }
  await del(urls, { token: BLOB_RW_TOKEN });
}

async function ensureBuffer(input: ArrayBuffer | Uint8Array | Blob | Buffer) {
  if (input instanceof Buffer) {
    return input;
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return Buffer.from(await input.arrayBuffer());
  }
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }
  const view = input as Uint8Array;
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}
