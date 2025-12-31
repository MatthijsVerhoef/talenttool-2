"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { LucideIcon } from "lucide-react";
import {
  FileText,
  LogOut,
  MessageSquare,
  Paperclip,
  Settings,
  Sparkles,
  Target,
  CheckCircle2,
  Lightbulb,
  UserRound,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

import { authClient } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const [activeChannel, setActiveChannel] = useState<"coach" | "meta">("coach");
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientForm, setClientForm] = useState({
    name: "",
    focusArea: "",
    summary: "",
    goals: "",
  });
  const [isClientSaving, setClientSaving] = useState(false);
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

  useEffect(() => {
    if (!selectedClient || isClientDialogOpen) {
      return;
    }
    setClientForm({
      name: selectedClient.name,
      focusArea: selectedClient.focusArea,
      summary: selectedClient.summary,
      goals: selectedClient.goals.join(", "),
    });
  }, [selectedClient, isClientDialogOpen]);

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
      setError("Prompt mag niet leeg les zijn.");
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

  async function handleClientSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClientId) {
      return;
    }

    setClientSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/clients/${selectedClientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientForm.name,
          focusArea: clientForm.focusArea,
          summary: clientForm.summary,
          goals: clientForm.goals
            .split(",")
            .map((goal) => goal.trim())
            .filter(Boolean),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Bijwerken van cliënt is mislukt.");
      }

      router.refresh();
      setClientDialogOpen(false);
    } catch (updateError) {
      console.error(updateError);
      setError(
        (updateError as Error).message ?? "Bijwerken van cliënt is mislukt."
      );
    } finally {
      setClientSaving(false);
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
    // Used a very flat light grey background for the app container
    <div className="flex h-screen bg-slate-50 text-slate-900">
      {/* Sidebar: Flat, bordered, minimal */}
      <aside className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {/* User avatar is now flat */}
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-medium text-white">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {currentUser.name}
              </p>
              <p className="text-xs text-slate-500">
                {isAdmin ? "Administrator" : "Coach"}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-8">
          {/* Clients Section */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-xs font-semibold text-slate-900">Cliënten</p>
            </div>
            <ul className="space-y-1">
              {clients.map((client) => {
                const isActive = client.id === selectedClientId;
                return (
                  <li key={client.id}>
                    <button
                      onClick={() => setSelectedClientId(client.id)}
                      // Active state is a subtle grey background, no shadows or bright colors
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        isActive
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <UserRound
                        className={`size-4 ${
                          isActive ? "text-slate-900" : "text-slate-400"
                        }`}
                      />
                      <span className="truncate text-sm font-medium flex-1">
                        {client.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Tools Section */}
          <div>
            <p className="px-2 mb-2 text-xs font-semibold text-slate-900">
              Tools
            </p>
            <ul className="space-y-1">
              {toolLinks.map(({ label, icon: Icon }) => {
                const restricted = label === "Rapportages" && !isAdmin;

                // Settings with Dialog Logic
                if (label === "Instellingen") {
                  if (!isAdmin) return null;
                  return (
                    <li key={label}>
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
                            <Icon className="size-4 text-slate-400" />
                            {label}
                          </button>
                        </DialogTrigger>
                        {/* Dialog Content - Flat style */}
                        <DialogContent className="max-w-2xl border-slate-200 p-6">
                          <DialogHeader>
                            <DialogTitle className="text-lg font-semibold">
                              Systeeminstellingen
                            </DialogTitle>
                            <DialogDescription className="text-slate-500">
                              Beheer de AI prompts voor je coaching workflow.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-6 pt-4">
                            {isCoachPromptLoading ? (
                              <p className="text-sm text-slate-500">
                                Coachprompt wordt geladen...
                              </p>
                            ) : (
                              <form
                                onSubmit={handleCoachPromptSave}
                                className="space-y-3"
                              >
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    Coach Prompt
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Instructies voor de individuele coach.
                                  </p>
                                </div>
                                <textarea
                                  value={coachPrompt}
                                  onChange={(event) =>
                                    setCoachPrompt(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 p-3 text-sm min-h-[100px] focus:border-slate-400 focus:ring-0 outline-none"
                                />
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                  <p>
                                    Laatst bijgewerkt:{" "}
                                    {coachPromptUpdatedAt
                                      ? new Date(coachPromptUpdatedAt).toLocaleString()
                                      : "Onbekend"}
                                  </p>
                                  <button
                                    disabled={isCoachPromptSaving}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    {isCoachPromptSaving ? "Opslaan..." : "Opslaan"}
                                  </button>
                                </div>
                              </form>
                            )}

                            {isOverseerPromptLoading ? (
                              <p className="text-sm text-slate-500">
                                Overzichtsprompt wordt geladen...
                              </p>
                            ) : (
                              <form
                                onSubmit={handleOverseerPromptSave}
                                className="space-y-3"
                              >
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    Overzichtscoach Prompt
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Richtlijnen voor programma-analyses en trends.
                                  </p>
                                </div>
                                <textarea
                                  value={overseerPrompt}
                                  onChange={(event) =>
                                    setOverseerPrompt(event.target.value)
                                  }
                                className="w-full rounded-lg border border-slate-300 p-3 text-sm min-h-[100px] focus:border-slate-400 focus:ring-0 outline-none"
                                />
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                  <p>
                                    Laatst bijgewerkt:{" "}
                                    {overseerPromptUpdatedAt
                                      ? new Date(overseerPromptUpdatedAt).toLocaleString()
                                      : "Onbekend"}
                                  </p>
                                  <button
                                    disabled={isOverseerPromptSaving}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50"
                                  >
                                    {isOverseerPromptSaving ? "Opslaan..." : "Opslaan"}
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </li>
                  );
                }

                return (
                  <li key={label}>
                    <button
                      disabled={restricted}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        restricted
                          ? "text-slate-400 cursor-not-allowed"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon className="size-4 text-slate-400" />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut className="size-4 text-slate-400" />
            Uitloggen
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {/* Top Header Bar: Flat, bordered */}
        <header className="h-16 border-b border-slate-200 bg-white px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900">
              {selectedClient ? selectedClient.name : "Dashboard"}
            </h1>
            {selectedClient && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                Actief
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && selectedClient && (
              <Dialog
                open={isClientDialogOpen}
                onOpenChange={(open) => {
                  setClientDialogOpen(open);
                  if (open) {
                    setClientForm({
                      name: selectedClient.name,
                      focusArea: selectedClient.focusArea,
                      summary: selectedClient.summary,
                      goals: selectedClient.goals.join(", "),
                    });
                  }
                }}
              >
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Cliënt bewerken
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-xl space-y-4">
                  <DialogHeader>
                    <DialogTitle>Gegevens van {selectedClient.name}</DialogTitle>
                    <DialogDescription>
                      Pas de basisinformatie en doelen van de cliënt aan.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleClientSave}>
                    <label className="flex flex-col gap-1 text-sm">
                      Naam
                      <input
                        type="text"
                        value={clientForm.name}
                        onChange={(event) =>
                          setClientForm((form) => ({
                            ...form,
                            name: event.target.value,
                          }))
                        }
                        className="rounded-lg border border-slate-200 p-2 text-sm focus:border-slate-900 focus:outline-none"
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Focusgebied
                      <input
                        type="text"
                        value={clientForm.focusArea}
                        onChange={(event) =>
                          setClientForm((form) => ({
                            ...form,
                            focusArea: event.target.value,
                          }))
                        }
                        className="rounded-lg border border-slate-200 p-2 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Samenvatting
                      <textarea
                        value={clientForm.summary}
                        onChange={(event) =>
                          setClientForm((form) => ({
                            ...form,
                            summary: event.target.value,
                          }))
                        }
                        rows={4}
                        className="rounded-lg border border-slate-200 p-2 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Doelen (gescheiden door komma)
                      <textarea
                        value={clientForm.goals}
                        onChange={(event) =>
                          setClientForm((form) => ({
                            ...form,
                            goals: event.target.value,
                          }))
                        }
                        rows={3}
                        className="rounded-lg border border-slate-200 p-2 text-sm focus:border-slate-900 focus:outline-none"
                        placeholder="Bijv. Communicatie verbeteren, Energie bewaken"
                      />
                    </label>
                    <div className="flex justify-end gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => setClientDialogOpen(false)}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
                      >
                        Annuleren
                      </button>
                      <button
                        type="submit"
                        disabled={isClientSaving}
                        className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        {isClientSaving ? "Opslaan..." : "Opslaan"}
                      </button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {error && (
              <div className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-lg">
                {error}
              </div>
            )}
          </div>
        </header>

        {/* Scrollable Dashboard Grid */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6 pb-12">
            {/* Context Cards: Flat, white background, thin grey border */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile Card */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    Profiel Samenvatting
                  </h3>
                  <UserRound className="size-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {selectedClient?.summary || "Selecteer een cliënt."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedClient?.focusArea.split(",").map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium border border-slate-200 capitalize"
                    >
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              </div>

              {/* Goals Card - Flat white instead of colored block */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-900">
                    Doelen
                  </h3>
                  <Target className="size-5 text-slate-400" />
                </div>
                <ul className="space-y-3">
                  {selectedClient?.goals.length ? (
                    selectedClient.goals.map((goal, i) => (
                      <li
                        key={i}
                        className="text-sm flex gap-3 items-start text-slate-700"
                      >
                        <span className="font-medium text-slate-400">
                          {i + 1}.
                        </span>
                        <span className="leading-tight">{goal}</span>
                      </li>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      Geen doelen ingesteld.
                    </p>
                  )}
                </ul>
              </div>
            </div>

            {/* Bottom Row: Chat Area and Insights Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Main Chat Interface */}
              <div className="lg:col-span-2 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden h-[600px]">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-4 bg-white">
                  <button
                    onClick={() => setActiveChannel("coach")}
                    className={`text-sm font-medium transition-colors ${
                      activeChannel === "coach"
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Coach Assistent
                  </button>
                  <button
                    onClick={() => setActiveChannel("meta")}
                    className={`text-sm font-medium transition-colors ${
                      activeChannel === "meta"
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Meta AI Twin
                  </button>
                </div>

                {activeChannel === "coach" ? (
                  <>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                      {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                          <MessageSquare className="size-6 mb-2 opacity-50" />
                          <p className="text-sm">Start een gesprek.</p>
                        </div>
                      ) : (
                        messages.map((message) => {
                          const isAi =
                            message.role === "assistant" ||
                            message.role === "system";
                          return (
                            <div
                              key={message.id}
                              className={`flex ${
                                isAi ? "justify-start" : "justify-end"
                              }`}
                            >
                              <div
                                className={`max-w-[85%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
                                  isAi
                                    ? "bg-slate-50 border border-slate-200 text-slate-800"
                                    : "bg-indigo-600 text-white"
                                }`}
                              >
                                <p className="whitespace-pre-wrap">
                                  {message.content}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <form
                      onSubmit={handleCoachSubmit}
                      className="p-4 bg-white border-t border-slate-200"
                    >
                      <div className="relative flex gap-2">
                        <textarea
                          value={coachInput}
                          onChange={(event) => setCoachInput(event.target.value)}
                          placeholder="Schrijf een bericht..."
                          className="flex-1 p-3 bg-white border border-slate-300 rounded-lg text-sm focus:border-slate-400 focus:ring-0 resize-none placeholder:text-slate-400"
                          rows={1}
                          style={{ minHeight: "44px", maxHeight: "120px" }}
                        />
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleAttachmentButtonClick}
                            className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Paperclip className="size-5" />
                          </button>
                          <button
                            type="submit"
                            disabled={!selectedClient || isCoachLoading}
                            className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium text-sm"
                          >
                            Versturen
                          </button>
                        </div>
                      </div>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        className="sr-only"
                        onChange={handleAttachmentChange}
                      />
                    </form>
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
                  </>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-white">
                      {overseerThread.length === 0 ? (
                        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                          Vraag de overzichtscoach om trends of risico&#39;s.
                        </div>
                      ) : (
                        overseerThread.map((message) => (
                          <div
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
                          </div>
                        ))
                      )}
                    </div>
                    <form
                      onSubmit={handleOverseerSubmit}
                      className="p-4 bg-white border-t border-slate-200"
                    >
                      <textarea
                        value={overseerInput}
                        onChange={(event) => setOverseerInput(event.target.value)}
                        placeholder="Vraag naar trends, risico&#39;s..."
                        disabled={isOverseerLoading}
                        className="w-full resize-none rounded-lg border border-slate-300 p-3 text-sm focus:border-purple-500 focus:ring-0 placeholder:text-slate-400"
                        rows={2}
                      />
                      <button
                        type="submit"
                        disabled={!overseerInput.trim() || isOverseerLoading}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40"
                      >
                        Verstuur
                      </button>
                    </form>
                  </>
                )}
              </div>

              {/* Insights and Documents Sidebar: Flat cards */}
              <div className="space-y-6">
                {/* AI Insights Panel - Removed amber styling, kept it flat white */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="size-5 text-slate-400" />
                    <h3 className="text-base font-semibold text-slate-900">
                      Laatste Inzicht
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600 italic leading-relaxed">
                    {latestCoachFeedback}
                  </p>
                </div>

                {/* Growth Checklist */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="size-5 text-slate-400" />
                    <h3 className="text-base font-semibold text-slate-900">
                      Sterktes & Aandachtspunten
                    </h3>
                  </div>
                  <ul className="space-y-3">
                    {strengthsAndWatchouts.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex gap-3 text-sm text-slate-700"
                      >
                        <div className="mt-1.5 size-1.5 rounded-full bg-slate-300 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Documents Panel */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="size-5 text-slate-400" />
                      <h3 className="text-base font-semibold text-slate-900">
                        Documenten
                      </h3>
                    </div>
                    <button
                      onClick={handleAttachmentButtonClick}
                      className="text-indigo-600 text-sm font-medium hover:underline"
                    >
                      Uploaden
                    </button>
                  </div>
                  <div className="space-y-1">
                    {documents.length > 0 ? (
                      documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <FileText className="size-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700 truncate flex-1">
                            {doc.name}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 italic py-2">
                        Geen documenten.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
