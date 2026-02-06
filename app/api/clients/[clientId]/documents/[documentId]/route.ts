import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { deleteFromBlob } from "@/lib/blob";
import {
  deleteClientDocumentById,
  getClientDocumentById,
  getClientDocuments,
  getClientForUser,
} from "@/lib/data/store";

interface RouteParams {
  params: Promise<{
    clientId: string;
    documentId: string;
  }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { clientId, documentId } = await params;

  if (!clientId || !documentId) {
    return NextResponse.json(
      { error: "Cliënt of document ontbreekt." },
      { status: 400 },
    );
  }

  const client = await getClientForUser(
    clientId,
    session.user.id,
    session.user.role as UserRole,
  );
  if (!client) {
    return NextResponse.json({ error: "Cliënt niet gevonden." }, { status: 404 });
  }

  const document = await getClientDocumentById(documentId);
  if (!document || document.clientId !== clientId) {
    return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });
  }

  if (document.storedName) {
    await deleteFromBlob(document.storedName).catch((blobError) => {
      console.error("Blob delete failed", blobError);
    });
  }

  const deleted = await deleteClientDocumentById(documentId);
  if (!deleted) {
    return NextResponse.json(
      { error: "Document verwijderen is mislukt." },
      { status: 500 },
    );
  }

  const documents = await getClientDocuments(clientId);

  return NextResponse.json({
    success: true,
    documents,
  });
}
