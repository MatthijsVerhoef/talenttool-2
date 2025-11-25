import { Buffer } from "node:buffer";

import { put } from "@vercel/blob";

const BLOB_RW_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

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
    throw new Error("Missing BLOB_READ_WRITE_TOKEN environment variable.");
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
