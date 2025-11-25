"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  AgentMessage,
  ClientDocument,
  ClientProfile,
} from "@/lib/data/store";

interface CoachDashboardProps {
  clients: ClientProfile[];
}

type HistoryState = Record<string, AgentMessage[]>;
type DocumentState = Record<string, ClientDocument[]>;

export function CoachDashboard({ clients }: CoachDashboardProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clients[0]?.id ?? null
  );
  const [clientHistories, setClientHistories] = useState<HistoryState>({});
  const [clientDocuments, setClientDocuments] = useState<DocumentState>({});
  const [overseerThread, setOverseerThread] = useState<AgentMessage[]>([]);
  const [coachInput, setCoachInput] = useState("");
  const [overseerInput, setOverseerInput] = useState("");
  const [isCoachLoading, setCoachLoading] = useState(false);
  const [isOverseerLoading, setOverseerLoading] = useState(false);
  const [isDocUploading, setDocUploading] = useState(false);
  const [coachPrompt, setCoachPrompt] = useState("");
  const [coachPromptUpdatedAt, setCoachPromptUpdatedAt] = useState<
    string | null
  >(null);
  const [isCoachPromptLoading, setCoachPromptLoading] = useState(true);
  const [isCoachPromptSaving, setCoachPromptSaving] = useState(false);
  const [overseerPrompt, setOverseerPrompt] = useState("");
  const [overseerPromptUpdatedAt, setOverseerPromptUpdatedAt] = useState<
    string | null
  >(null);
  const [isOverseerPromptLoading, setOverseerPromptLoading] = useState(true);
  const [isOverseerPromptSaving, setOverseerPromptSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId),
    [clients, selectedClientId]
  );

  useEffect(() => {
    if (!selectedClientId) {
      return;
    }
    const alreadyLoaded = clientHistories[selectedClientId];
    if (!alreadyLoaded) {
      void fetchClientHistory(selectedClientId);
    }
    if (!clientDocuments[selectedClientId]) {
      void fetchClientDocuments(selectedClientId);
    }
  }, [selectedClientId, clientHistories, clientDocuments]);

  useEffect(() => {
    void fetchOverseerThread();
  }, []);

  useEffect(() => {
    void fetchCoachPrompt();
    void fetchOverseerPrompt();
  }, []);

  async function fetchClientHistory(clientId: string) {
    try {
      const response = await fetch(`/api/coach/${clientId}`);
      if (!response.ok) {
        throw new Error("Kan gespreksgeschiedenis niet laden.");
      }
      const data = await response.json();
      setClientHistories((prev) => ({
        ...prev,
        [clientId]: data.history ?? [],
      }));
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        (fetchError as Error).message ?? "Geschiedenis laden is mislukt."
      );
    }
  }

  async function fetchOverseerThread() {
    try {
      const response = await fetch("/api/overseer");
      if (!response.ok) {
        throw new Error("Kan overview-gesprek niet laden.");
      }
      const data = await response.json();
      setOverseerThread(data.thread ?? []);
    } catch (fetchError) {
      console.error(fetchError);
    }
  }

  const test = console.log("test");

  async function fetchClientDocuments(clientId: string) {
    try {
      const response = await fetch(`/api/clients/${clientId}/documents`);
      if (!response.ok) {
        throw new Error("Kan documenten niet laden.");
      }
      const data = await response.json();
      setClientDocuments((prev) => ({
        ...prev,
        [clientId]: data.documents ?? [],
      }));
    } catch (fetchError) {
      console.error(fetchError);
      setError((fetchError as Error).message ?? "Documenten laden is mislukt.");
    }
  }

  async function fetchCoachPrompt() {
    setCoachPromptLoading(true);
    try {
      const response = await fetch("/api/prompts/coach");
      if (!response.ok) {
        throw new Error("Kan coachprompt niet laden.");
      }
      const data = await response.json();
      setCoachPrompt(data.prompt ?? "");
      setCoachPromptUpdatedAt(data.updatedAt ?? null);
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        (fetchError as Error).message ?? "Coachprompt laden is mislukt."
      );
    } finally {
      setCoachPromptLoading(false);
    }
  }

  async function fetchOverseerPrompt() {
    setOverseerPromptLoading(true);
    try {
      const response = await fetch("/api/prompts/overseer");
      if (!response.ok) {
        throw new Error("Kan overzichtsprompt niet laden.");
      }
      const data = await response.json();
      setOverseerPrompt(data.prompt ?? "");
      setOverseerPromptUpdatedAt(data.updatedAt ?? null);
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        (fetchError as Error).message ?? "Overzichtsprompt laden is mislukt."
      );
    } finally {
      setOverseerPromptLoading(false);
    }
  }

  async function handleCoachSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClientId || !coachInput.trim()) {
      return;
    }

    setCoachLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/coach/${selectedClientId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: coachInput }),
      });

      if (!response.ok) {
        throw new Error("Coach kon niet reageren.");
      }

      const data = await response.json();
      setClientHistories((prev) => ({
        ...prev,
        [selectedClientId]: data.history ?? [],
      }));
      setCoachInput("");
    } catch (sendError) {
      console.error(sendError);
      setError(
        (sendError as Error).message ?? "Contact met de coach is mislukt."
      );
    } finally {
      setCoachLoading(false);
    }
  }

  async function handleCoachPromptSave(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!coachPrompt.trim()) {
      setError("Prompt mag niet leeg zijn.");
      return;
    }

    setCoachPromptSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/prompts/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: coachPrompt }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Prompt opslaan is mislukt.");
      }

      setCoachPrompt(data.prompt ?? coachPrompt);
      setCoachPromptUpdatedAt(data.updatedAt ?? null);
    } catch (saveError) {
      console.error(saveError);
      setError(
        (saveError as Error).message ?? "Coachprompt opslaan is mislukt."
      );
    } finally {
      setCoachPromptSaving(false);
    }
  }

  async function handleOverseerPromptSave(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!overseerPrompt.trim()) {
      setError("Prompt mag niet leeg zijn.");
      return;
    }

    setOverseerPromptSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/prompts/overseer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: overseerPrompt }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Prompt opslaan is mislukt.");
      }

      setOverseerPrompt(data.prompt ?? overseerPrompt);
      setOverseerPromptUpdatedAt(data.updatedAt ?? null);
    } catch (saveError) {
      console.error(saveError);
      setError(
        (saveError as Error).message ?? "Overzichtsprompt opslaan is mislukt."
      );
    } finally {
      setOverseerPromptSaving(false);
    }
  }

  async function handleOverseerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overseerInput.trim()) {
      return;
    }

    setOverseerLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/overseer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: overseerInput }),
      });
      if (!response.ok) {
        throw new Error("Overzichtscoach kon niet reageren.");
      }
      const data = await response.json();
      setOverseerThread(data.thread ?? []);
      setOverseerInput("");
    } catch (sendError) {
      console.error(sendError);
      setError(
        (sendError as Error).message ??
          "Contact met de overzichtscoach is mislukt."
      );
    } finally {
      setOverseerLoading(false);
    }
  }

  async function handleDocumentUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClientId) {
      return;
    }

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem(
      "document"
    ) as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("Selecteer een bestand om te uploaden.");
      return;
    }

    setDocUploading(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch(
        `/api/clients/${selectedClientId}/documents`,
        {
          method: "POST",
          body: payload,
        }
      );
      if (!response.ok) {
        throw new Error("Uploaden is mislukt.");
      }

      const data = await response.json();
      setClientDocuments((prev) => ({
        ...prev,
        [selectedClientId]: data.documents ?? [],
      }));

      form.reset();
    } catch (uploadError) {
      console.error(uploadError);
      setError((uploadError as Error).message ?? "Uploaden is niet gelukt.");
    } finally {
      setDocUploading(false);
    }
  }

  const messages = selectedClientId
    ? clientHistories[selectedClientId] ?? []
    : [];
  const documents = selectedClientId
    ? clientDocuments[selectedClientId] ?? []
    : [];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
        <aside className="w-full h-fit rounded-2xl bg-white p-5 shadow-sm lg:w-72">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Actieve cliënten
            </p>
          </div>
          <ul className="space-y-3">
            {clients.map((client) => {
              const isActive = client.id === selectedClientId;
              return (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedClientId(client.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-blue-500 bg-blue-50 text-blue-900"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <p className="text-sm font-semibold">{client.name}</p>
                    <p className="text-xs text-slate-500">{client.focusArea}</p>
                  </button>
                </li>
              );
            })}
          </ul>
              {selectedClient && (
                <div className="mt-6 space-y-5">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Overzicht
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {selectedClient.summary}
                    </p>
                    <p className="mt-4 text-xs font-semibold uppercase text-slate-400">
                      Doelen
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                      {selectedClient.goals.map((goal) => (
                        <li key={goal}>{goal}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
        </aside>

        <div className="flex-1 space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Coachkanaal
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {selectedClient
                    ? `Coach voor ${selectedClient.name}`
                    : "Selecteer een cliënt"}
                </h2>
              </div>
              {isCoachLoading && (
                <p className="text-xs text-blue-500">
                  Coach bereidt een antwoord voor...
                </p>
              )}
            </header>
            {selectedClient && (
              <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Bijlagen
                  </p>
                  <p className="text-xs text-slate-500">
                    Documenten gedeeld met de coach van {selectedClient.name}
                  </p>
                </div>
                {documents.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Nog geen bestanden toegevoegd.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-xs text-slate-600">
                    {documents.map((doc) => (
                      <li
                        key={doc.id}
                        className="rounded-xl border border-slate-100 bg-white/70 p-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">
                              {doc.originalName}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {(doc.size / 1024).toFixed(1)} KB ·{" "}
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              doc.kind === "AUDIO"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {doc.kind === "AUDIO" ? "Audio" : "Tekst"}
                          </span>
                        </div>
                        {doc.kind === "AUDIO" && doc.audioDuration && (
                          <p className="text-[11px] text-slate-500">
                            Duur: {doc.audioDuration.toFixed(1)} s
                          </p>
                        )}
                        {doc.content && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                            {doc.content}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  onSubmit={handleDocumentUpload}
                  className="mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center"
                >
                  <input
                    type="file"
                    name="document"
                    accept=".txt,.md,.json,.csv,.pdf,.doc,.docx"
                    disabled={isDocUploading}
                    className="flex-1 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={isDocUploading}
                    className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
                  >
                    {isDocUploading ? "Uploaden..." : "Bijlage uploaden"}
                  </button>
                </form>
              </div>
            )}
            <div className="mb-4 h-72 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">Nog geen gesprek.</p>
              ) : (
                <ul className="space-y-3">
                  {messages.map((message) => {
                    const usage = message.meta?.usage as
                      | { totalTokens?: number }
                      | undefined;
                    return (
                      <li
                        key={message.id}
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          message.role === "assistant" ||
                          message.role === "system"
                            ? "border-blue-200 bg-blue-50 text-blue-900"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <p className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                          <span>{message.role}</span>
                          <span className="text-[11px] text-slate-500">
                            {message.source === "HUMAN" ? "Coach" : "AI"}
                          </span>
                        </p>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </p>
                        {usage && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            tokens: {usage.totalTokens ?? "?"}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <form onSubmit={handleCoachSubmit} className="space-y-3">
              <textarea
                value={coachInput}
                onChange={(event) => setCoachInput(event.target.value)}
                placeholder={
                  selectedClient
                    ? `Werk de coach van ${selectedClient.name} bij...`
                    : "Selecteer eerst een cliënt om te starten."
                }
                disabled={!selectedClient || isCoachLoading}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
                rows={3}
              />
              <button
                type="submit"
                disabled={
                  !selectedClient || !coachInput.trim() || isCoachLoading
                }
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Verstuur naar coach
              </button>
            </form>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Overzichtscoach
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Programmacoach
                </h2>
              </div>
              {isOverseerLoading && (
                <p className="text-xs text-purple-500">
                  Analyse wordt samengesteld...
                </p>
              )}
            </header>
            <div className="mb-4 h-64 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-4">
              {overseerThread.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Vraag de overzichtscoach om inzichten over cliënten.
                </p>
              ) : (
                <ul className="space-y-3">
                  {overseerThread.map((message) => (
                    <li
                      key={message.id}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        message.role === "assistant"
                          ? "border-purple-200 bg-purple-50 text-purple-900"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <p className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                        <span>{message.role}</span>
                        <span className="text-[11px] text-slate-500">
                          {message.source === "HUMAN" ? "Coach" : "AI"}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form onSubmit={handleOverseerSubmit} className="space-y-3">
              <textarea
                value={overseerInput}
                onChange={(event) => setOverseerInput(event.target.value)}
                placeholder="Vraag naar trends, risico's of volgende acties..."
                disabled={isOverseerLoading}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-purple-500 focus:outline-none disabled:opacity-60"
                rows={3}
              />
              <button
                type="submit"
                disabled={!overseerInput.trim() || isOverseerLoading}
                className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Vraag overzichtscoach
              </button>
            </form>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <header className="mb-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Promptbeheer
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Systeeminstructies
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Werk direct de basisprompts bij voor zowel de cliëntcoach als de
                overzichtscoach.
              </p>
            </header>
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Prompt voor coach
                    </p>
                    <p className="text-xs text-slate-500">
                      Stuurt individuele cliëntanalyses.
                    </p>
                  </div>
                  {isCoachPromptSaving && (
                    <span className="text-xs text-emerald-600">Opslaan…</span>
                  )}
                </div>
                {isCoachPromptLoading ? (
                  <p className="text-sm text-slate-500">
                    Coachprompt wordt geladen...
                  </p>
                ) : (
                  <form onSubmit={handleCoachPromptSave} className="space-y-3">
                    <textarea
                      value={coachPrompt}
                      onChange={(event) => setCoachPrompt(event.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-emerald-500 focus:outline-none"
                      placeholder="Beschrijf hier hoe de AI-coach zich moet gedragen..."
                    />
                    <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-slate-400">
                        Laatst bijgewerkt:{" "}
                        {coachPromptUpdatedAt
                          ? new Date(coachPromptUpdatedAt).toLocaleString()
                          : "standaardprompt"}
                      </p>
                      <button
                        type="submit"
                        disabled={isCoachPromptSaving}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        {isCoachPromptSaving ? "Opslaan..." : "Prompt opslaan"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Prompt voor overzichtscoach
                    </p>
                    <p className="text-xs text-slate-500">
                      Stuurt programma-analyses en trends.
                    </p>
                  </div>
                  {isOverseerPromptSaving && (
                    <span className="text-xs text-purple-600">Opslaan…</span>
                  )}
                </div>
                {isOverseerPromptLoading ? (
                  <p className="text-sm text-slate-500">
                    Overzichtsprompt wordt geladen...
                  </p>
                ) : (
                  <form
                    onSubmit={handleOverseerPromptSave}
                    className="space-y-3"
                  >
                    <textarea
                      value={overseerPrompt}
                      onChange={(event) =>
                        setOverseerPrompt(event.target.value)
                      }
                      rows={6}
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-purple-500 focus:outline-none"
                      placeholder="Beschrijf de toon en focus voor de overzichtscoach..."
                    />
                    <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-slate-400">
                        Laatst bijgewerkt:{" "}
                        {overseerPromptUpdatedAt
                          ? new Date(overseerPromptUpdatedAt).toLocaleString()
                          : "standaardprompt"}
                      </p>
                      <button
                        type="submit"
                        disabled={isOverseerPromptSaving}
                        className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        {isOverseerPromptSaving
                          ? "Opslaan..."
                          : "Prompt opslaan"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
