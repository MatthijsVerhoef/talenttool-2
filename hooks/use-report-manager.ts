"use client";

import { useCallback, useEffect, useState } from "react";

type ClientReport = {
  content: string;
  createdAt: string | null;
  id: string;
};

type ReportState = Record<string, ClientReport[]>;

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}

interface UseReportManagerOptions {
  selectedClientId: string | null;
}

export function useReportManager({ selectedClientId }: UseReportManagerOptions) {
  const [clientReports, setClientReports] = useState<ReportState>({});
  const [isReportGenerating, setReportGenerating] = useState(false);
  const [isReportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const clientReportList = selectedClientId
    ? (clientReports[selectedClientId] ?? [])
    : [];

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    setReportError(null);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    if (Object.prototype.hasOwnProperty.call(clientReports, selectedClientId)) return;
    let cancelled = false;
    setReportLoading(true);
    setReportError(null);
    void fetchClientReports(selectedClientId)
      .catch((fetchError) => {
        if (cancelled) return;
        console.error(fetchError);
        setReportError(
          fetchError instanceof Error ? fetchError.message : "Kan rapport niet ophalen."
        );
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, clientReports]);

  // ── Fetchers ─────────────────────────────────────────────────────────────

  async function fetchClientReports(clientId: string) {
    const response = await fetch(`/api/clients/${clientId}/report?limit=5`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Kan rapport niet ophalen."
      );
    }
    const reports = Array.isArray(data.reports)
      ? data.reports
          .map((entry: unknown) =>
            typeof entry === "object" && entry !== null ? entry : null
          )
          .filter(
            (
              entry: unknown
            ): entry is { id?: unknown; content?: unknown; createdAt?: unknown } =>
              Boolean(entry)
          )
          .map((entry: { id?: unknown; content?: unknown; createdAt?: unknown }) => {
            const parsedId =
              typeof entry.id === "string"
                ? entry.id
                : typeof window !== "undefined" && window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : Math.random().toString(36).slice(2);
            return {
              id: parsedId,
              content: typeof entry.content === "string" ? entry.content : "",
              createdAt:
                typeof entry.createdAt === "string" ? entry.createdAt : null,
            };
          })
      : [];
    setClientReports((prev) => ({
      ...prev,
      [clientId]: reports,
    }));
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleGenerateReport() {
    if (!selectedClientId || isReportGenerating) return;
    setReportGenerating(true);
    setReportError(null);
    try {
      const response = await fetch(`/api/clients/${selectedClientId}/report`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Rapport genereren is mislukt.");
      }
      const generatedId =
        typeof data.reportId === "string"
          ? data.reportId
          : typeof window !== "undefined" && window.crypto?.randomUUID
          ? window.crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const newReport = {
        content: typeof data.report === "string" ? data.report : "",
        createdAt:
          typeof data.createdAt === "string"
            ? data.createdAt
            : new Date().toISOString(),
        id: generatedId,
      };
      setClientReports((prev) => ({
        ...prev,
        [selectedClientId]: [newReport, ...(prev[selectedClientId] ?? [])],
      }));
    } catch (generateError) {
      setReportError(
        generateError instanceof Error
          ? generateError.message
          : "Rapport genereren is mislukt."
      );
    } finally {
      setReportGenerating(false);
    }
  }

  async function handleRefreshReport() {
    if (!selectedClientId || isReportLoading) return;
    setReportLoading(true);
    setReportError(null);
    try {
      await fetchClientReports(selectedClientId);
    } catch (refreshError) {
      console.error(refreshError);
      setReportError(
        refreshError instanceof Error
          ? refreshError.message
          : "Kan rapport niet ophalen."
      );
    } finally {
      setReportLoading(false);
    }
  }

  function handleOpenReport(report?: {
    id: string;
    content: string;
    createdAt: string | null;
  }) {
    if (typeof window === "undefined" || !report?.content) return;
    const blob = new Blob([report.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const viewer = window.open(url, "_blank", "noopener,noreferrer");
    if (!viewer) {
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  const cleanupClientReports = useCallback((clientId: string) => {
    setClientReports((prev) => removeRecordKey(prev, clientId));
  }, []);

  return {
    clientReportList,
    isReportGenerating,
    isReportLoading,
    reportError,
    fetchClientReports,
    handleGenerateReport,
    handleRefreshReport,
    handleOpenReport,
    cleanupClientReports,
  };
}
