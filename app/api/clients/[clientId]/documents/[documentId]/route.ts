import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError } from "@/lib/authz";
import { deleteFromBlob } from "@/lib/blob";
import {
  deleteClientDocumentById,
  getClientDocumentById,
  getClientDocuments,
} from "@/lib/data/store";

interface RouteParams {
  params: Promise<{
    clientId: string;
    documentId: string;
  }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const cookie = request.headers.get("cookie") ?? "";
  const session = await auth.api.getSession({
    headers: { cookie },
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

  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      { route: "/api/clients/[clientId]/documents/[documentId]", clientId },
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
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
