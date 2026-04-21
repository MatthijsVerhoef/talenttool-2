import { Buffer } from "node:buffer";

import { SessionGuardError, requireAuthenticatedSession } from "@/lib/auth-guards";
import { uploadToBlob } from "@/lib/blob";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAuthenticatedSession(request, requestId);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonWithRequestId(session.requestId, { error: "Bestand ontbreekt" }, { status: 400 });
    }

    const storedName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const key = `avatars/${storedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const blob = await uploadToBlob(
      key,
      buffer,
      file.type || "application/octet-stream"
    );

    return jsonWithRequestId(session.requestId, { url: blob.url });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    throw error;
  }
}
