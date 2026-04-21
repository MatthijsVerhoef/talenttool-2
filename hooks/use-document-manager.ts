"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ClientDocument } from "@/lib/data/documents";

type DocumentState = Record<string, ClientDocument[]>;

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}

interface UseDocumentManagerOptions {
  selectedClientId: string | null;
  onError: (message: string | null) => void;
}

export function useDocumentManager({
  selectedClientId,
  onError,
}: UseDocumentManagerOptions) {
  const [clientDocuments, setClientDocuments] = useState<DocumentState>({});
  const [isDocUploading, setDocUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const selectedClientDocs = selectedClientId
    ? clientDocuments[selectedClientId]
    : undefined;

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedClientId) return;
    const docs = selectedClientDocs ?? [];
    const hasPendingExtraction = docs.some(
      (doc) => doc.extractionStatus === "PENDING"
    );
    if (!hasPendingExtraction) return;

    const timer = window.setTimeout(() => {
      void fetchClientDocuments(selectedClientId);
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, selectedClientDocs]);

  // ── Fetchers ─────────────────────────────────────────────────────────────

  async function fetchClientDocuments(clientId: string) {
    try {
      const response = await fetch(`/api/clients/${clientId}/documents`);
      if (!response.ok) throw new Error("Kan documenten niet laden.");
      const data = await response.json();
      setClientDocuments((prev) => ({
        ...prev,
        [clientId]: data.documents ?? [],
      }));
    } catch (fetchError) {
      console.error(fetchError);
      onError((fetchError as Error).message ?? "Documenten laden is mislukt.");
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function uploadClientDocument(file: File) {
    if (!selectedClientId) return;
    const clientId = selectedClientId;

    setDocUploading(true);
    onError(null);
    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        body: payload,
      });
      if (!response.ok) throw new Error("Uploaden is mislukt.");

      const data = await response.json();
      setClientDocuments((prev) => ({
        ...prev,
        [clientId]: data.documents ?? [],
      }));

      const latestUploaded = Array.isArray(data.documents) ? data.documents[0] : null;
      if (latestUploaded?.extractionStatus === "FAILED") {
        toast.error(
          "Bestand is geüpload, maar tekstextractie is mislukt. Probeer herverwerken."
        );
      } else if (latestUploaded?.extractionStatus === "PENDING") {
        toast("Bestand geüpload. Verwerking loopt nog.");
      } else {
        toast.success("Bestand geüpload.");
      }
    } catch (uploadError) {
      console.error(uploadError);
      onError((uploadError as Error).message ?? "Uploaden is niet gelukt.");
      void fetchClientDocuments(clientId);
    } finally {
      setDocUploading(false);
    }
  }

  const handleAttachmentButtonClick = useCallback(() => {
    if (!selectedClientId || isDocUploading) return;
    attachmentInputRef.current?.click();
  }, [selectedClientId, isDocUploading]);

  const handleAttachmentChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void uploadClientDocument(file);
      event.target.value = "";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedClientId]
  );

  async function handleDocumentDelete(documentId: string) {
    if (!selectedClientId || !documentId || deletingDocumentId === documentId) {
      return;
    }
    setDeletingDocumentId(documentId);
    onError(null);
    try {
      const response = await fetch(
        `/api/clients/${selectedClientId}/documents/${documentId}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Document verwijderen is mislukt.");
      }
      setClientDocuments((prev) => ({
        ...prev,
        [selectedClientId]: Array.isArray(data.documents)
          ? data.documents
          : (prev[selectedClientId] ?? []).filter((doc) => doc.id !== documentId),
      }));
    } catch (deleteError) {
      console.error(deleteError);
      onError((deleteError as Error).message ?? "Document verwijderen is mislukt.");
    } finally {
      setDeletingDocumentId((current) => (current === documentId ? null : current));
    }
  }

  const cleanupClientDocuments = useCallback((clientId: string) => {
    setClientDocuments((prev) => removeRecordKey(prev, clientId));
  }, []);

  const documents = selectedClientId
    ? (clientDocuments[selectedClientId] ?? [])
    : [];

  return {
    clientDocuments,
    documents,
    selectedClientDocs,
    isDocUploading,
    deletingDocumentId,
    attachmentInputRef,
    fetchClientDocuments,
    handleAttachmentButtonClick,
    handleAttachmentChange,
    handleDocumentDelete,
    cleanupClientDocuments,
  };
}
