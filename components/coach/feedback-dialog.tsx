"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentKindType } from "@/components/admin/prompt-center-panel";

export interface FeedbackTarget {
  agentType: AgentKindType;
  messageId: string;
  messageContent: string;
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedbackTarget: FeedbackTarget | null;
  feedbackText: string;
  setFeedbackText: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  feedbackTarget,
  feedbackText,
  setFeedbackText,
  isSubmitting,
  onSubmit,
  onCancel,
}: FeedbackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Geef feedback op AI-antwoord</DialogTitle>
          <DialogDescription>
            Beschrijf hoe de{" "}
            {feedbackTarget?.agentType === "OVERSEER"
              ? "Overzichtscoach"
              : "coach assistent"}{" "}
            het antwoord kan verbeteren.
          </DialogDescription>
        </DialogHeader>
        {feedbackTarget ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Originele reactie
              </p>
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 max-h-48 overflow-y-auto">
                <p className="whitespace-pre-wrap">
                  {feedbackTarget.messageContent}
                </p>
              </div>
            </div>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-slate-900">Jouw feedback</span>
              <textarea
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                rows={4}
                placeholder="Beschrijf wat anders moet of wat ontbreekt..."
                className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-900 focus:outline-none"
                required
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-[#2ea3f2] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {isSubmitting ? "Versturen..." : "Verstuur feedback"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">
            Selecteer een AI-bericht om feedback te geven.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
