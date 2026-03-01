import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { uploadToBlob } from "@/lib/blob";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Bestand ontbreekt" }, { status: 400 });
  }

  const storedName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const key = `avatars/${storedName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const blob = await uploadToBlob(
    key,
    buffer,
    file.type || "application/octet-stream"
  );

  return NextResponse.json({ url: blob.url });
}
