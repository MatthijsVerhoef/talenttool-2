"use client";

import Image from "next/image";
import { ArrowLeft, UserRound } from "lucide-react";

import type { ClientProfile } from "@/lib/data/clients";

export interface MobileChatHeaderProps {
  selectedClient: ClientProfile | null | undefined;
  selectedClientInitials: string;
  onBack: () => void;
  onViewDetails: () => void;
}

export function MobileChatHeader({
  selectedClient,
  selectedClientInitials,
  onBack,
  onViewDetails,
}: MobileChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-full text-xs font-semibold text-slate-600"
      >
        <ArrowLeft className="size-4" />
      </button>
      <div className="flex flex-1 items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2ea3f2] text-white overflow-hidden">
          {selectedClient?.avatarUrl ? (
            <Image
              src={selectedClient.avatarUrl}
              alt={selectedClient?.name ?? "Coachee"}
              width={40}
              height={40}
              className="size-10 object-cover"
              unoptimized
            />
          ) : selectedClientInitials ? (
            <span className="text-sm font-semibold">
              {selectedClientInitials}
            </span>
          ) : (
            <UserRound className="size-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {selectedClient?.name ?? "Selecteer een Coachee"}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {selectedClient?.focusArea || "Geen focus"}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewDetails}
        disabled={!selectedClient}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 lg:hidden"
      >
        Cliëntdetails
      </button>
    </div>
  );
}
