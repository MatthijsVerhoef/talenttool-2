import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

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

  const uploadDir = path.join(process.cwd(), "uploads", clientId);
  await mkdir(uploadDir, { recursive: true });

  const storedName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const filePath = path.join(uploadDir, storedName);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);

  const content = shouldStoreContent(file.type, file.name)
    ? buffer.toString("utf-8").slice(0, 8000)
    : undefined;

  await createClientDocument({
    clientId,
    originalName: file.name,
    storedName,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    content,
  });

  const documents = await getClientDocuments(clientId);
  return NextResponse.json({ documents });
}

function shouldStoreContent(mimeType: string, fileName: string) {
  if (mimeType?.startsWith("text/") || mimeType === "application/json") {
    return true;
  }
  return /\.(md|txt|json|csv)$/i.test(fileName);
}
