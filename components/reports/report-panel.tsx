"use client";

import { FileText } from "lucide-react";

export interface Report {
  id: string;
  content: string;
  createdAt: string | null;
}

interface ReportPanelProps {
  reports: Report[];
  isLoading: boolean;
  isGenerating: boolean;
  disabled: boolean;
  error: string | null;
  onGenerate: () => void;
  onOpen: (report: Report) => void;
}

export function ReportPanel({
  reports,
  isLoading,
  isGenerating,
  disabled,
  error,
  onGenerate,
  onOpen,
}: ReportPanelProps) {
  return (
    <div className="rounded-3xl bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Rapporten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={disabled || isGenerating}
            className="rounded-full bg-[#2ea3f2] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isGenerating ? "Bezig..." : "Genereer"}
          </button>
        </div>
      </div>
      {error && <p className="text-[12px] text-red-500">{error}</p>}
      {reports.length === 0 ? (
        <p className="text-[13px] text-slate-500">
          {isLoading
            ? "Rapporten worden geladen..."
            : "Nog geen rapporten beschikbaar."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {reports.map((report) => {
            const createdDate = report.createdAt
              ? new Date(report.createdAt)
              : null;
            const label = createdDate
              ? createdDate.toLocaleString()
              : "Onbekende versie";
            return (
              <li
                key={report.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="size-3.5 min-w-3.5 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-slate-800">
                      {label}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {report.content ? "Beschikbaar" : "Leeg rapport"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(report)}
                  className="text-[11px] text-slate-500 hover:text-slate-700"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
