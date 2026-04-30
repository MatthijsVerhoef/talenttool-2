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
