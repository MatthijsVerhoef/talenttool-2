"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  FileText,
  LogOut,
  MessageSquare,
  Paperclip,
  Send,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

import { authClient } from "@/lib/auth-client";

import type {
  AgentMessage,
  ClientDocument,
  ClientProfile,
} from "@/lib/data/store";

interface CoachDashboardProps {
  clients: ClientProfile[];
  currentUser: {
    name: string;
    email: string;
    image?: string | null;
    role: UserRole;
  };
}

type HistoryState = Record<string, AgentMessage[]>;
type DocumentState = Record<string, ClientDocument[]>;

const toolLinks: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Meta AI Twin", icon: Sparkles },
  { label: "Rapportages", icon: FileText },
  { label: "Instellingen", icon: Settings },
];

export function CoachDashboard({ clients, currentUser }: CoachDashboardProps) {
  const router = useRouter();
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
  const [isSigningOut, setSigningOut] = useState(false);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId),
    [clients, selectedClientId]
  );

  useEffect(() => {
    if (!selectedClientId) return;
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
    void fetchCoachPrompt();
    void fetchOverseerPrompt();
  }, []);

  async function fetchClientHistory(clientId: string) {
    try {
      const response = await fetch(`/api/coach/${clientId}`);
      if (!response.ok) throw new Error("Kan gespreksgeschiedenis niet laden.");
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
      if (!response.ok) throw new Error("Kan overview-gesprek niet laden.");
      const data = await response.json();
      setOverseerThread(data.thread ?? []);
    } catch (fetchError) {
      console.error(fetchError);
    }
  }

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
      setError((fetchError as Error).message ?? "Documenten laden is mislukt.");
    }
  }

  async function fetchCoachPrompt() {
    setCoachPromptLoading(true);
    try {
      const response = await fetch("/api/prompts/coach");
      if (!response.ok) throw new Error("Kan coachprompt niet laden.");
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
      if (!response.ok) throw new Error("Kan overzichtsprompt niet laden.");
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
    if (!selectedClientId || !coachInput.trim()) return;

    setCoachLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/coach/${selectedClientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: coachInput }),
      });

      if (!response.ok) throw new Error("Coach kon niet reageren.");

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: coachPrompt }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error ?? "Prompt opslaan is mislukt.");

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: overseerPrompt }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error ?? "Prompt opslaan is mislukt.");

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
    if (!overseerInput.trim()) return;

    setOverseerLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/overseer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: overseerInput }),
      });
      if (!response.ok) throw new Error("Overzichtscoach kon niet reageren.");
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

  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadClientDocument(file: File) {
    if (!selectedClientId) return;

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
      if (!response.ok) throw new Error("Uploaden is mislukt.");

      const data = await response.json();
      setClientDocuments((prev) => ({
        ...prev,
        [selectedClientId]: data.documents ?? [],
      }));
    } catch (uploadError) {
      console.error(uploadError);
      setError((uploadError as Error).message ?? "Uploaden is niet gelukt.");
    } finally {
      setDocUploading(false);
    }
  }

  const handleAttachmentButtonClick = () => {
    if (!selectedClientId || isDocUploading) return;
    attachmentInputRef.current?.click();
  };

  const handleAttachmentChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void uploadClientDocument(file);
    event.target.value = "";
  };

  const userInitial = currentUser.name?.charAt(0).toUpperCase() ?? "C";
  const isAdmin = currentUser.role === "ADMIN";

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    } catch (signOutError) {
      console.error(signOutError);
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Uitloggen is niet gelukt."
      );
    } finally {
      setSigningOut(false);
    }
  }

  const messages = useMemo(
    () => (selectedClientId ? clientHistories[selectedClientId] ?? [] : []),
    [clientHistories, selectedClientId]
  );

  const documents = useMemo(
    () => (selectedClientId ? clientDocuments[selectedClientId] ?? [] : []),
    [clientDocuments, selectedClientId]
  );

  const latestCoachFeedback = useMemo(() => {
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant"
    );
    if (assistantMessages.length === 0) {
      return "Nog geen feedback beschikbaar. Start een gesprek met de coach assistent om nieuwe inzichten te verzamelen.";
    }
    return assistantMessages[assistantMessages.length - 1]?.content;
  }, [messages]);

  const strengthsAndWatchouts = useMemo(() => {
    if (!selectedClient) {
      return [
        "Selecteer een cliënt om sterktes en aandachtspunten te bekijken.",
        "Gebruik het coachkanaal om actuele inzichten vast te leggen.",
      ];
    }

    return [
      `Sterk: intrinsieke motivatie rondom ${selectedClient.focusArea.toLowerCase()}.`,
      "Sterk: reflecteert open op coachingvragen.",
      "Aandachtspunt: energie verdelen over langere trajecten.",
      "Aandachtspunt: vertaalt inzichten nog beperkt naar concrete acties.",
    ];
  }, [selectedClient]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Minimal Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white">
        <div className="flex h-screen flex-col">
          {/* User Section */}
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {currentUser.name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {currentUser.email}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {isAdmin ? "Admin" : "Coach"}
                </p>
              </div>
            </div>
          </div>

          {/* Clients List */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-2 px-2 text-xs font-medium text-slate-500">
              Cliënten
            </p>
            <ul className="space-y-1">
              {clients.map((client) => {
                const isActive = client.id === selectedClientId;
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <UserRound className="h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {client.name}
                        </p>
                        <p
                          className={`truncate text-xs ${
                            isActive ? "text-white/70" : "text-slate-500"
                          }`}
                        >
                          {client.focusArea}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Tools */}
            <p className="mb-2 mt-6 px-2 text-xs font-medium text-slate-500">
              Tools
            </p>
            <ul className="space-y-1">
              {toolLinks.map(({ label, icon: Icon }) => {
                const restricted = label === "Rapportages" && !isAdmin;
                return (
                  <li key={label}>
                    <button
                      type="button"
                      disabled={restricted}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition ${
                        restricted
                          ? "cursor-not-allowed border border-dashed border-slate-200 text-slate-400"
                          : "hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Sign Out */}
          <div className="border-t border-slate-200 p-3">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              Uitloggen
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          {/* Header */}
          <header className="mb-6">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <MessageSquare className="h-4 w-4" />
              Coach kanaal
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              {selectedClient ? selectedClient.name : "Selecteer een cliënt"}
            </h1>
          </header>

          {/* Profile & Info Cards */}
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Profiel
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedClient ? selectedClient.name : "Nog geen cliënt"}
                    </h3>
                  </div>
                  <UserRound className="h-8 w-8 text-slate-300" />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {selectedClient
                    ? selectedClient.summary
                    : "Selecteer een cliënt om achtergrondinformatie te bekijken."}
                </p>
              </div>

              <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      AI Coach Feedback
                    </p>
                    <p className="text-xs text-slate-500">Laatste inzichten</p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {latestCoachFeedback}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  Sterktes & Aandachtspunten
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {strengthsAndWatchouts.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1.5 size-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Doelen</p>
                  <CalendarClock className="h-5 w-5 text-slate-300" />
                </div>
                {selectedClient && selectedClient.goals.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {selectedClient.goals.map((goal) => (
                      <li key={goal} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                        <span>{goal}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    Nog geen doelen geregistreerd.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Chat & Reports */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Chat Section */}
            <div className="lg:col-span-2">
              <div className="rounded-xl bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Coach Assistent
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">
                        {selectedClient ? selectedClient.name : "Geen cliënt"}
                      </h3>
                    </div>
                    {isCoachLoading && (
                      <span className="text-xs text-blue-600">
                        Aan het typen...
                      </span>
                    )}
                  </div>
                </div>

                {/* Chat Messages - Fixed Height with Scroll */}
                <div className="h-96 overflow-y-auto p-4">
                  <div className="space-y-3">
                    {messages.length === 0 ? (
                      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                        Start een gesprek met de coach assistent.
                      </div>
                    ) : (
                      messages.map((message) => {
                        const isAssistant =
                          message.role === "assistant" ||
                          message.role === "system";
                        return (
                          <div
                            key={message.id}
                            className={`flex ${
                              isAssistant ? "justify-start" : "justify-end"
                            }`}
                          >
                            <div
                              className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${
                                isAssistant
                                  ? "bg-slate-100 text-slate-900"
                                  : "bg-blue-600 text-white"
                              }`}
                            >
                              <p className="text-xs opacity-70">
                                {message.role}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">
                                {message.content}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Input Form */}
                <form
                  onSubmit={handleCoachSubmit}
                  className="border-t border-slate-200 p-4"
                >
                  <textarea
                    value={coachInput}
                    onChange={(e) => setCoachInput(e.target.value)}
                    placeholder="Stel een vraag..."
                    disabled={!selectedClient || isCoachLoading}
                    className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
                    rows={2}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      className="sr-only"
                      onChange={handleAttachmentChange}
                    />
                    <button
                      type="button"
                      onClick={handleAttachmentButtonClick}
                      disabled={!selectedClient || isDocUploading}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Paperclip className="h-4 w-4" />
                      {isDocUploading ? "Uploaden..." : "Bijlage"}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        !selectedClient || !coachInput.trim() || isCoachLoading
                      }
                      className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                      Versturen
                    </button>
                  </div>
                </form>

                {/* Documents */}
                {selectedClient && (
                  <div className="border-t border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        Documenten
                      </p>
                      {isDocUploading && (
                        <span className="text-xs text-slate-500">
                          Uploaden…
                        </span>
                      )}
                    </div>
                    {documents.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nog geen bestanden.
                      </p>
                    ) : (
                      <div className="max-h-40 space-y-2 overflow-y-auto">
                        {documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {doc.originalName}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {(doc.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                              <span className="whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                {doc.kind === "AUDIO" ? "Audio" : "Tekst"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Reports Sidebar */}
            {isAdmin ? (
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Rapportages
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      Exports
                    </h3>
                  </div>
                  <FileText className="h-5 w-5 text-slate-300" />
                </div>
                <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
                  {!selectedClient ? (
                    <p className="text-sm text-slate-500">
                      Selecteer een cliënt om exports te bekijken.
                    </p>
                  ) : documents.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Geen documenten geüpload voor deze cliënt.
                    </p>
                  ) : (
                    documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {doc.originalName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(doc.size / 1024).toFixed(1)} KB · {" "}
                            {doc.kind === "AUDIO" ? "Audio" : "Tekst"}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <p>{new Date(doc.createdAt).toLocaleDateString()}</p>
                          {doc.audioDuration && (
                            <p className="text-[11px] text-slate-400">
                              {doc.audioDuration.toFixed(1)} s
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Admins kunnen exports downloaden of delen als context voor AI.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-white p-5 text-sm text-slate-500 shadow-sm">
                <p className="text-xs font-medium text-slate-500">
                  Rapportages
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  Beperkte toegang
                </h3>
                <p className="mt-2">
                  Alleen admins kunnen exports van cliënten bekijken en beheren.
                </p>
              </div>
            )}
          </div>

          {/* Overseer & Prompts */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* Overseer */}
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Overzichtscoach
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    Programma Analyse
                  </h3>
                </div>
                {isOverseerLoading && (
                  <span className="text-xs text-purple-600">Analyseren...</span>
                )}
              </div>
              <div className="mt-4 h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {overseerThread.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Vraag de overzichtscoach om trends of risico&#39;s.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {overseerThread.map((message) => (
                      <li
                        key={message.id}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          message.role === "assistant"
                            ? "border-purple-200 bg-white text-slate-900"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <p className="text-xs uppercase text-slate-500">
                          {message.role}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <form onSubmit={handleOverseerSubmit} className="mt-4 space-y-3">
                <textarea
                  value={overseerInput}
                  onChange={(e) => setOverseerInput(e.target.value)}
                  placeholder="Vraag naar trends, risico&#39;s..."
                  disabled={isOverseerLoading}
                  className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-purple-500 focus:outline-none disabled:opacity-60"
                  rows={2}
                />
                <button
                  type="submit"
                  disabled={!overseerInput.trim() || isOverseerLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  Verstuur
                </button>
              </form>
            </div>

            {/* Prompt Management */}
            {isAdmin ? (
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Promptbeheer
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    Systeeminstructies
                  </h3>
                </div>

                <div className="mt-4 space-y-4">
                  {/* Coach Prompt */}
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Coach Prompt
                        </p>
                        <p className="text-xs text-slate-500">
                          Individuele analyses
                        </p>
                      </div>
                      {isCoachPromptSaving && (
                        <span className="text-xs text-emerald-600">Opslaan…</span>
                      )}
                    </div>
                    {isCoachPromptLoading ? (
                      <p className="text-sm text-slate-500">Laden...</p>
                    ) : (
                      <form
                        onSubmit={handleCoachPromptSave}
                        className="space-y-3"
                      >
                        <textarea
                          value={coachPrompt}
                          onChange={(e) => setCoachPrompt(e.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-emerald-500 focus:outline-none"
                          placeholder="Beschrijf hoe de AI-coach zich moet gedragen..."
                        />
                        <div className="flex items-center justify-between text-xs">
                          <p className="text-slate-500">
                            {coachPromptUpdatedAt
                              ? new Date(coachPromptUpdatedAt).toLocaleString()
                              : "Standaard"}
                          </p>
                          <button
                            type="submit"
                            disabled={isCoachPromptSaving}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                          >
                            Opslaan
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Overseer Prompt */}
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Overzicht Prompt
                        </p>
                        <p className="text-xs text-slate-500">
                          Programma analyses
                        </p>
                      </div>
                      {isOverseerPromptSaving && (
                        <span className="text-xs text-purple-600">Opslaan…</span>
                      )}
                    </div>
                    {isOverseerPromptLoading ? (
                      <p className="text-sm text-slate-500">Laden...</p>
                    ) : (
                      <form
                        onSubmit={handleOverseerPromptSave}
                        className="space-y-3"
                      >
                        <textarea
                          value={overseerPrompt}
                          onChange={(e) => setOverseerPrompt(e.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-purple-500 focus:outline-none"
                          placeholder="Beschrijf de focus voor de overzichtscoach..."
                        />
                        <div className="flex items-center justify-between text-xs">
                          <p className="text-slate-500">
                            {overseerPromptUpdatedAt
                              ? new Date(overseerPromptUpdatedAt).toLocaleString()
                              : "Standaard"}
                          </p>
                          <button
                            type="submit"
                            disabled={isOverseerPromptSaving}
                            className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
                          >
                            Opslaan
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-white p-5 text-sm text-slate-500 shadow-sm">
                <p className="text-xs font-medium text-slate-500">
                  Promptbeheer
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  Beperkte toegang
                </h3>
                <p className="mt-2">
                  Alleen admins kunnen de systeem- en overzichtsprompts aanpassen.
                </p>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
