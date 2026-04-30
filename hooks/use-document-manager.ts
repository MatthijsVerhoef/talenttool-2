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
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const selectedClientDocs = selectedClientId
    ? clientDocuments[selectedClientId]
    : undefined;

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

  async function uploadClientDocument(file: File, displayName?: string) {
    if (!selectedClientId) return;
    const clientId = selectedClientId;

    setDocUploading(true);
    onError(null);
    try {
      const payload = new FormData();
      payload.append("file", file);
      if (displayName?.trim()) {
        payload.append("displayName", displayName.trim());
      }

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
        toast.error("Bestand is geüpload, maar tekstextractie is mislukt. Probeer herverwerken.");
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

  const confirmUploadWithLabel = useCallback(
    async (label: string) => {
      if (!pendingFile) return;
      const file = pendingFile;
      setPendingFile(null);
      await uploadClientDocument(file, label);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingFile, selectedClientId]
  );

  const cancelPendingUpload = useCallback(() => {
    setPendingFile(null);
  }, []);

  const handleAttachmentButtonClick = useCallback(() => {
    if (!selectedClientId || isDocUploading) return;
    attachmentInputRef.current?.click();
  }, [selectedClientId, isDocUploading]);

  const handleAttachmentChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setPendingFile(file);
      event.target.value = "";
    },
    []
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

  async function handleDocumentRename(documentId: string, displayName: string) {
    if (!selectedClientId || !documentId || renamingDocumentId === documentId) {
      return;
    }
    setRenamingDocumentId(documentId);
    onError(null);
    try {
      const response = await fetch(
        `/api/clients/${selectedClientId}/documents/${documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Naam wijzigen is mislukt.");
      }
      setClientDocuments((prev) => ({
        ...prev,
        [selectedClientId]: Array.isArray(data.documents)
          ? data.documents
          : (prev[selectedClientId] ?? []).map((doc) =>
              doc.id === documentId
                ? { ...doc, displayName: displayName.trim() || null }
                : doc
            ),
      }));
    } catch (renameError) {
      console.error(renameError);
      onError((renameError as Error).message ?? "Naam wijzigen is mislukt.");
    } finally {
      setRenamingDocumentId((current) => (current === documentId ? null : current));
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
    renamingDocumentId,
    pendingFile,
    attachmentInputRef,
    fetchClientDocuments,
    handleAttachmentButtonClick,
    handleAttachmentChange,
    confirmUploadWithLabel,
    cancelPendingUpload,
    handleDocumentDelete,
    handleDocumentRename,
    cleanupClientDocuments,
  };
}
