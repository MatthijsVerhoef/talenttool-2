const BLOB_API_URL = process.env.BLOB_API_URL ?? "https://blob.vercel-storage.com";
const BLOB_RW_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export interface BlobUploadResult {
  url: string;
  pathname?: string;
  size?: number;
  uploadedAt?: string;
  contentType?: string;
}

export async function uploadToBlob(
  key: string,
  data: ArrayBuffer | Buffer,
  contentType?: string,
): Promise<BlobUploadResult> {
  if (!BLOB_RW_TOKEN) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN environment variable.");
  }

  const response = await fetch(BLOB_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BLOB_RW_TOKEN}`,
      "x-vercel-filename": key,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body: data,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Blob upload failed: ${response.status} ${message}`);
  }

  return (await response.json()) as BlobUploadResult;
}
