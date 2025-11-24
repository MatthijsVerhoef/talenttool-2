import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { transcribeAudio } from "@/lib/ai/openai";
import { uploadToBlob } from "@/lib/blob";
import {
  createClientDocument,
  getClient,
  getClientDocuments,
} from "@/lib/data/store";

interface Params {
  params: Promise<{
    clientId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { clientId } = await params;

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "Cliënt niet gevonden." }, { status: 404 });
  }

  const documents = await getClientDocuments(clientId);
  return NextResponse.json({ documents });
}

export async function POST(request: Request, { params }: Params) {
  const { clientId } = await params;
  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "Cliënt niet gevonden." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Bestand is verplicht." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Bestand is leeg." }, { status: 400 });
  }

  const storedName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const blobKey = `${clientId}/${storedName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const isAudio = isAudioFile(file.name, file.type);
  let content: string | undefined;
  let audioDuration: number | undefined;

  if (isAudio) {
    const tempPath = path.join(os.tmpdir(), storedName);
    await writeFile(tempPath, buffer);
    try {
      const transcription = await transcribeAudio(tempPath, file.type);
      content = transcription.text?.trim() || undefined;
      audioDuration = transcription.duration;
    } catch (error) {
      console.error("Audio transcription failed", error);
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
  } else if (shouldStoreContent(file.type, file.name)) {
    content = buffer.toString("utf-8").slice(0, 8000);
  }

  try {
    const blob = await uploadToBlob(
      blobKey,
      buffer,
      file.type || "application/octet-stream",
    );

    await createClientDocument({
      clientId,
      originalName: file.name,
      storedName: blob.url,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      content,
      kind: isAudio ? "AUDIO" : "TEXT",
      audioDuration,
    });
  } catch (error) {
    console.error("Blob upload failed", error);
    return NextResponse.json(
      { error: "Uploaden is mislukt. Controleer blob-configuratie." },
      { status: 500 },
    );
  }

  const documents = await getClientDocuments(clientId);
  return NextResponse.json({ documents });
}

function shouldStoreContent(mimeType: string, fileName: string) {
  if (mimeType?.startsWith("text/") || mimeType === "application/json") {
    return true;
  }
  return /\.(md|txt|json|csv)$/i.test(fileName);
}

function isAudioFile(fileName: string, mimeType?: string) {
  if (mimeType?.startsWith("audio/")) {
    return true;
  }
  return /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(fileName);
}
