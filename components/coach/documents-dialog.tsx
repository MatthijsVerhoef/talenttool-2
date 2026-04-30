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
