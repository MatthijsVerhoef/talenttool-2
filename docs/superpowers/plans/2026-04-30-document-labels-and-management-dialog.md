# Document Labels & Management Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-friendly `displayName` label to documents (settable at upload time and editable later), plus a management dialog in the sidebar where coaches can open, rename, and delete documents.

**Architecture:** Add a nullable `displayName` field to `ClientDocument` via Prisma migration; expose the blob URL (`storedName`) as `blobUrl` in the API response; add a PATCH rename endpoint; intercept file selection in the hook to show a label dialog before uploading; build a `DocumentsDialog` that lists all documents with open/rename/delete actions.

**Tech Stack:** Next.js App Router, Prisma, shadcn `Dialog`, Lucide icons, TypeScript, Tailwind CSS.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `prisma/schema.prisma` | Modify | Add `displayName String?` to `ClientDocument` |
| `lib/data/documents.ts` | Modify | Add `displayName`/`blobUrl` to interface & mapper; add `renameClientDocument`; accept `displayName` in `createClientDocument` |
| `lib/data/documents-legacy.ts` | Modify | Add `displayName` to `LEGACY_DOCUMENT_SELECT` and `mapLegacyDocument` |
| `app/api/clients/[clientId]/documents/route.ts` | Modify | Read `displayName` from FormData and pass to `createClientDocument` |
| `app/api/clients/[clientId]/documents/[documentId]/route.ts` | Modify | Add PATCH handler for rename |
| `hooks/use-document-manager.ts` | Modify | Add pending-upload state, upload-with-label flow, rename handler |
| `components/coach/upload-label-dialog.tsx` | Create | Small dialog shown after file selection; label input pre-filled with filename |
| `components/coach/documents-dialog.tsx` | Create | Full management dialog: list docs with open/rename/delete |
| `components/coach/client-details-panel.tsx` | Modify | Accept new props; add "Beheren" button; mount both dialogs |
| `components/coach-dashboard.tsx` | Modify | Destructure and pass new hook values to `clientDetailsProps` |

---

## Task 1: Prisma migration — add `displayName`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add field to schema**

In `prisma/schema.prisma`, add `displayName` after `originalName` in the `ClientDocument` model:

```prisma
model ClientDocument {
  id             String       @id @default(cuid())
  client         Client       @relation(fields: [clientId], references: [id], onDelete: Cascade)
  clientId       String
  originalName   String
  displayName    String?
  storedName     String
  mimeType       String
  size           Int
  kind           DocumentKind @default(TEXT)
  content        String?      @db.Text
  extractionStatus DocumentExtractionStatus @default(PENDING)
  extractionError  String?     @db.Text
  extractedAt      DateTime?
  audioDuration  Float?
  createdAt      DateTime     @default(now())

  chunks         DocumentChunk[]

  @@index([clientId])
}
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/matthijsverhoef/Documents/Projecten/interly/talenttool
npx prisma migrate dev --name add_document_display_name
```

Expected output: `The following migration(s) have been created and applied … add_document_display_name`

- [ ] **Step 3: Verify generated client includes field**

```bash
npx prisma generate
grep -n "displayName" node_modules/.prisma/client/index.d.ts | head -5
```

Expected: lines showing `displayName?: string | null`

---

## Task 2: Data layer — types, mapper, create, rename

**Files:**
- Modify: `lib/data/documents.ts`
- Modify: `lib/data/documents-legacy.ts`

- [ ] **Step 1: Add `displayName` and `blobUrl` to `ClientDocument` interface**

In `lib/data/documents.ts`, update the `ClientDocument` interface (currently lines 24–37):

```typescript
export interface ClientDocument {
  id: string;
  originalName: string;
  displayName: string | null;
  blobUrl: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: DocumentKind;
  createdAt: string;
  audioDuration?: number | null;
  content?: string | null;
  extractionStatus: DocumentExtractionStatus;
  extractionError?: string | null;
  extractedAt?: string | null;
}
```

- [ ] **Step 2: Update `mapDocument` to include new fields**

The `mapDocument` function (currently lines 60–91) takes a plain object. Add `displayName?: string | null` to its parameter type and map both new fields:

```typescript
function mapDocument(document: {
  id: string;
  originalName: string;
  displayName?: string | null;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  kind: DocumentKind;
  audioDuration: number | null;
  content: string | null;
  extractionStatus: DocumentExtractionStatus;
  extractionError: string | null;
  extractedAt: Date | null;
  clientId?: string;
}): ClientDocument {
  return {
    id: document.id,
    originalName: document.originalName,
    displayName: document.displayName ?? null,
    blobUrl: document.storedName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    kind: document.kind,
    audioDuration: document.audioDuration,
    createdAt: document.createdAt.toISOString(),
    content: document.content,
    extractionStatus: document.extractionStatus,
    extractionError: document.extractionError,
    extractedAt: document.extractedAt ? document.extractedAt.toISOString() : null,
  };
}
```

- [ ] **Step 3: Accept `displayName` in `createClientDocument`**

Add `displayName?: string | null` to the input type and pass it in both create paths:

```typescript
export async function createClientDocument(input: {
  clientId: string;
  originalName: string;
  displayName?: string | null;
  storedName: string;
  mimeType: string;
  size: number;
  content?: string;
  kind?: DocumentKind;
  audioDuration?: number;
  extractionStatus?: DocumentExtractionStatus;
  extractionError?: string | null;
  extractedAt?: Date | null;
}): Promise<ClientDocument> {
```

In the legacy create path (the `prisma.clientDocument.create` inside `if (isExtendedDocumentSchemaKnownMissing())`), add `displayName: input.displayName ?? null` to the `data` object.

In the primary create path (inside `tx.clientDocument.create`), also add `displayName: input.displayName ?? null` to the `data` object.

- [ ] **Step 4: Add `renameClientDocument` function**

Append this new export after `deleteClientDocumentById`:

```typescript
export async function renameClientDocument(
  documentId: string,
  clientId: string,
  displayName: string,
): Promise<ClientDocument | null> {
  try {
    const updated = await prisma.clientDocument.update({
      where: { id: documentId, clientId },
      data: { displayName: displayName.trim() || null },
    });
    return mapDocument(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }
    throw error;
  }
}
```

- [ ] **Step 5: Update legacy module**

In `lib/data/documents-legacy.ts`, add `displayName: true` to `LEGACY_DOCUMENT_SELECT`:

```typescript
export const LEGACY_DOCUMENT_SELECT = {
  id: true,
  originalName: true,
  displayName: true,
  storedName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  kind: true,
  audioDuration: true,
  content: true,
} satisfies Prisma.ClientDocumentSelect;
```

Update `mapLegacyDocument` parameter type and return to include new fields:

```typescript
export function mapLegacyDocument(document: {
  id: string;
  originalName: string;
  displayName?: string | null;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  kind: "TEXT" | "AUDIO";
  audioDuration: number | null;
  content: string | null;
}) {
  return {
    id: document.id,
    originalName: document.originalName,
    displayName: document.displayName ?? null,
    blobUrl: document.storedName,
    storedName: document.storedName,
    // ... rest unchanged
  };
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (no errors).

---

## Task 3: API — upload accepts label, PATCH for rename

**Files:**
- Modify: `app/api/clients/[clientId]/documents/route.ts`
- Modify: `app/api/clients/[clientId]/documents/[documentId]/route.ts`

- [ ] **Step 1: Read `displayName` from upload FormData**

In `app/api/clients/[clientId]/documents/route.ts`, after `const file = formData.get("file");`, add:

```typescript
const rawDisplayName = formData.get("displayName");
const displayName =
  typeof rawDisplayName === "string" && rawDisplayName.trim()
    ? rawDisplayName.trim()
    : null;
```

Then pass it to `createClientDocument`:

```typescript
const createdDocument = await createClientDocument({
  clientId,
  originalName: file.name,
  displayName,
  storedName: blob.url,
  mimeType: file.type || "application/octet-stream",
  size: file.size,
  extractionStatus: DocumentExtractionStatus.PENDING,
  extractionError: null,
  extractedAt: null,
});
```

- [ ] **Step 2: Add PATCH handler for rename**

Import `renameClientDocument` at the top of `app/api/clients/[clientId]/documents/[documentId]/route.ts`:

```typescript
import {
  deleteClientDocumentById,
  getClientDocumentById,
  getClientDocuments,
  renameClientDocument,
  updateClientDocumentExtraction,
} from "@/lib/data/documents";
```

Add the PATCH handler at the end of the file:

```typescript
export async function PATCH(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients/[clientId]/documents/[documentId] PATCH",
  });

  if (!session) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { clientId, documentId } = await params;
  if (!clientId || !documentId) {
    return jsonWithRequestId(requestId, { error: "Coachee of document ontbreekt." }, { status: 400 });
  }

  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      { requestId, route: "/api/clients/[clientId]/documents/[documentId]", clientId }
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonWithRequestId(requestId, { error: error.message }, { status: 403 });
    }
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonWithRequestId(requestId, { error: "Ongeldig verzoek." }, { status: 400 });
  }

  const { displayName } = body as { displayName?: string };
  if (typeof displayName !== "string") {
    return jsonWithRequestId(requestId, { error: "displayName is verplicht." }, { status: 400 });
  }

  const updated = await renameClientDocument(documentId, clientId, displayName);
  if (!updated) {
    return jsonWithRequestId(requestId, { error: "Document niet gevonden." }, { status: 404 });
  }

  const documents = await getClientDocuments(clientId);
  return jsonWithRequestId(requestId, { success: true, document: updated, documents });
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

---

## Task 4: Hook — pending upload state and rename handler

**Files:**
- Modify: `hooks/use-document-manager.ts`

- [ ] **Step 1: Add pending upload state and rename handler**

Replace the entire hook with the updated version. Key changes:
- Add `pendingFile` state (the file selected but not yet uploaded)
- `handleAttachmentChange` now sets `pendingFile` instead of uploading immediately
- New `confirmUploadWithLabel(label)` sends `displayName` in FormData
- New `cancelPendingUpload()` clears pending state
- New `handleDocumentRename(documentId, displayName)` calls PATCH
- Export `handleDocumentDelete` (it exists but wasn't previously exported)

```typescript
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

---

## Task 5: `UploadLabelDialog` component

**Files:**
- Create: `components/coach/upload-label-dialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UploadLabelDialogProps {
  file: File | null;
  onConfirm: (label: string) => void;
  onCancel: () => void;
}

export function UploadLabelDialog({ file, onConfirm, onCancel }: UploadLabelDialogProps) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file) {
      // Strip extension for a cleaner default label
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      setLabel(nameWithoutExt);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [file]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(label.trim() || file?.name || "");
  }

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Naam voor document</DialogTitle>
          <DialogDescription>
            Geef dit document een herkenbare naam. De bestandsnaam wordt standaard gebruikt.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-1 text-[11px] text-slate-500">Bestandsnaam: {file?.name}</p>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bijv. Q1 Assessment"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2ea3f2]"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
            >
              Annuleren
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#2ea3f2] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1b8fd9]"
            >
              Uploaden
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Task 6: `DocumentsDialog` component

**Files:**
- Create: `components/coach/documents-dialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileText, Mic, Pencil, Trash2, Check, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ClientDocument } from "@/lib/data/documents";

interface DocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: ClientDocument[];
  deletingDocumentId: string | null;
  renamingDocumentId: string | null;
  onDelete: (documentId: string) => void;
  onRename: (documentId: string, displayName: string) => void;
}

function StatusBadge({ status }: { status: ClientDocument["extractionStatus"] }) {
  if (status === "READY") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
        Gereed
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
        Mislukt
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
      Verwerken…
    </span>
  );
}

interface DocumentRowProps {
  doc: ClientDocument;
  isDeleting: boolean;
  isRenaming: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function DocumentRow({ doc, isDeleting, isRenaming, onDelete, onRename }: DocumentRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(doc.displayName ?? doc.originalName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditValue(doc.displayName ?? doc.originalName);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 30);
  }

  function commitEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== (doc.displayName ?? doc.originalName)) {
      onRename(doc.id, trimmed);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setEditValue(doc.displayName ?? doc.originalName);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      {doc.kind === "AUDIO" ? (
        <Mic className="size-4 shrink-0 text-slate-400" />
      ) : (
        <FileText className="size-4 shrink-0 text-slate-400" />
      )}

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              className="w-full rounded-lg border border-[#2ea3f2] px-2 py-0.5 text-xs focus:outline-none"
            />
            <button type="button" onClick={commitEdit} disabled={isRenaming} className="shrink-0 text-green-600 hover:text-green-700">
              <Check className="size-3.5" />
            </button>
            <button type="button" onClick={cancelEdit} className="shrink-0 text-slate-400 hover:text-slate-600">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <p className="truncate text-[12px] font-medium text-slate-800">
            {doc.displayName ?? doc.originalName}
          </p>
        )}
        {!editing && (
          <p className="truncate text-[10px] text-slate-400">{doc.originalName}</p>
        )}
      </div>

      <StatusBadge status={doc.extractionStatus} />

      <div className="flex shrink-0 items-center gap-1">
        <a
          href={doc.blobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Openen"
        >
          <ExternalLink className="size-3.5" />
        </a>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Naam wijzigen"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { onDelete(doc.id); setConfirmDelete(false); }}
              disabled={isDeleting}
              className="rounded-lg p-1 text-red-500 hover:bg-red-50"
              title="Bevestig verwijderen"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isDeleting}
            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            title="Verwijderen"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function DocumentsDialog({
  open,
  onOpenChange,
  documents,
  deletingDocumentId,
  renamingDocumentId,
  onDelete,
  onRename,
}: DocumentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Documenten</DialogTitle>
          <DialogDescription>
            {documents.length === 0
              ? "Nog geen documenten geüpload."
              : `${documents.length} ${documents.length === 1 ? "document" : "documenten"}`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {documents.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-slate-400">
              Upload een document via de knop in de zijbalk.
            </p>
          ) : (
            documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                isDeleting={deletingDocumentId === doc.id}
                isRenaming={renamingDocumentId === doc.id}
                onDelete={onDelete}
                onRename={onRename}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Task 7: Wire everything in `client-details-panel.tsx` and `coach-dashboard.tsx`

**Files:**
- Modify: `components/coach/client-details-panel.tsx`
- Modify: `components/coach-dashboard.tsx`

- [ ] **Step 1: Update `DocumentProps` interface and document section in `client-details-panel.tsx`**

Extend the existing `DocumentProps` interface (find it by searching for `interface.*DocumentProps` or the block that has `documents`, `isUploading`, `onUpload`):

```typescript
interface DocumentProps {
  documents: ClientDocument[];
  isUploading: boolean;
  pendingFile: File | null;
  deletingDocumentId: string | null;
  renamingDocumentId: string | null;
  onUpload: () => void;
  onConfirmUpload: (label: string) => void;
  onCancelUpload: () => void;
  onDelete: (documentId: string) => void;
  onRename: (documentId: string, displayName: string) => void;
}
```

Add imports at the top of the file:

```typescript
import { useState } from "react";
import { DocumentsDialog } from "@/components/coach/documents-dialog";
import { UploadLabelDialog } from "@/components/coach/upload-label-dialog";
```

Replace the entire documents section (the `<div className="rounded-3xl bg-white p-5 space-y-4">` block that ends with `{documents.length === 0 ? null : null}`) with:

```tsx
<div className="rounded-3xl bg-white p-5 space-y-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs font-semibold mb-0.5 tracking-wide text-slate-700">
        Documenten
      </p>
      <p className="text-[11px] text-slate-500">
        {documents.length > 0
          ? `${documents.length} ${documents.length === 1 ? "bestand" : "bestanden"}`
          : "Geen bestanden"}
      </p>
    </div>
    <div className="flex items-center gap-2">
      {documents.length > 0 && (
        <button
          type="button"
          onClick={() => setDocsDialogOpen(true)}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Beheren
        </button>
      )}
      <button
        type="button"
        onClick={onUpload}
        disabled={isUploading}
        className="rounded-full bg-[#2ea3f2] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1b8fd9]"
      >
        {isUploading ? "Uploaden..." : "Upload"}
      </button>
    </div>
  </div>

  <UploadLabelDialog
    file={pendingFile}
    onConfirm={onConfirmUpload}
    onCancel={onCancelUpload}
  />

  <DocumentsDialog
    open={docsDialogOpen}
    onOpenChange={setDocsDialogOpen}
    documents={documents}
    deletingDocumentId={deletingDocumentId}
    renamingDocumentId={renamingDocumentId}
    onDelete={onDelete}
    onRename={onRename}
  />
</div>
```

Add `const [docsDialogOpen, setDocsDialogOpen] = useState(false);` inside the component that renders this section. If the document section is rendered inside `ClientDetailsPanel`, add it there at the top of the function body.

- [ ] **Step 2: Update `coach-dashboard.tsx` — destructure new hook values and pass to props**

Update the destructure of `useDocumentManager` at line ~111:

```typescript
const {
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
} = useDocumentManager({ selectedClientId, onError: setError });
```

Update the `documentProps` object (around line 509):

```typescript
documentProps: {
  documents,
  isUploading: isDocUploading,
  pendingFile,
  deletingDocumentId,
  renamingDocumentId,
  onUpload: handleAttachmentButtonClick,
  onConfirmUpload: confirmUploadWithLabel,
  onCancelUpload: cancelPendingUpload,
  onDelete: handleDocumentDelete,
  onRename: handleDocumentRename,
},
```

- [ ] **Step 3: Final type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add \
  prisma/schema.prisma \
  prisma/migrations/ \
  lib/data/documents.ts \
  lib/data/documents-legacy.ts \
  app/api/clients/*/documents/route.ts \
  app/api/clients/*/documents/*/route.ts \
  hooks/use-document-manager.ts \
  components/coach/upload-label-dialog.tsx \
  components/coach/documents-dialog.tsx \
  components/coach/client-details-panel.tsx \
  components/coach-dashboard.tsx
git commit -m "feat: document labels, upload naming, and management dialog"
```

---

## Self-Review

**Spec coverage:**
- ✅ User-friendly label (`displayName`) separate from filename → Task 1–2
- ✅ Set label at upload time → Tasks 4–5 (pending file state + UploadLabelDialog)
- ✅ Management dialog button in sidebar → Task 7 ("Beheren" button)
- ✅ Open document in new tab → Task 6 (`blobUrl` link)
- ✅ Rename document → Tasks 2, 3, 4, 6
- ✅ Delete document → Tasks 4, 6 (delete was already in hook; now wired to UI)
- ✅ Legacy DB schema compatibility maintained → Task 2 (LEGACY_DOCUMENT_SELECT updated)

**Type consistency:**
- `confirmUploadWithLabel` in hook → `onConfirmUpload` in props interface → matches
- `cancelPendingUpload` in hook → `onCancelUpload` in props → matches
- `handleDocumentRename(id, displayName)` → `onRename(id, displayName)` → matches
- `blobUrl` added to interface in Task 2, used in Task 6 → consistent
- `displayName: string | null` throughout → consistent
