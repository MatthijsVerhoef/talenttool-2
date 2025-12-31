"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
type SettingsTab = "profile" | "prompts";

const toolLinks: Array<{ label: string; icon: LucideIcon }> = [
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
    avatarUrl: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [userForm, setUserForm] = useState({
    name: currentUser.name,
    image: currentUser.image ?? "",
  });
  const [userAvatarFile, setUserAvatarFile] = useState<File | null>(null);
  const [isUserSaving, setUserSaving] = useState(false);
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
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("profile");
  const isAdmin = currentUser.role === "ADMIN";
  const userInitial = currentUser.name?.charAt(0).toUpperCase() ?? "C";
  const settingsSections = useMemo<
    Array<{
      id: SettingsTab;
      label: string;
      title: string;
      description: string;
    }>
  >(
    () => [
      {
        id: "profile",
        label: "Persoonlijk",
        title: "Mijn profiel",
        description: "Beheer je accountgegevens en profielfoto.",
      },
      ...(isAdmin
        ? [
            {
              id: "prompts" as const,
              label: "Prompts",
              title: "AI Prompts",
              description:
                "Configureer coach- en overzichtsprompts voor het systeem.",
            },
          ]
        : []),
    ],
    [isAdmin]
  );
  const activeSettings =
    settingsSections.find((section) => section.id === activeSettingsTab) ??
    settingsSections[0];

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
      avatarUrl: selectedClient.avatarUrl ?? "",
    });
    setAvatarFile(null);
  }, [selectedClient, isClientDialogOpen]);

  useEffect(() => {
    setUserForm({
      name: currentUser.name,
      image: currentUser.image ?? "",
    });
    setUserAvatarFile(null);
  }, [currentUser]);

  useEffect(() => {
    if (!isAdmin && activeSettingsTab === "prompts") {
      setActiveSettingsTab("profile");
    }
  }, [isAdmin, activeSettingsTab]);

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

      if (avatarFile) {
        const avatarForm = new FormData();
        avatarForm.append("file", avatarFile);
        const uploadResponse = await fetch(`/api/uploads/avatar`, {
          method: "POST",
          body: avatarForm,
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.url) {
          throw new Error(uploadData.error ?? "Avatar uploaden is mislukt.");
        }
        await fetch(`/api/clients/${selectedClientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatarUrl: uploadData.url,
          }),
        });
      }

      router.refresh();
      setClientDialogOpen(false);
      setAvatarFile(null);
    } catch (updateError) {
      console.error(updateError);
      setError(
        (updateError as Error).message ?? "Bijwerken van cliënt is mislukt."
      );
    } finally {
      setClientSaving(false);
    }
  }

  async function handleUserSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserSaving(true);
    setError(null);
    try {
      let imageUrl = userForm.image;
      if (userAvatarFile) {
        const avatarForm = new FormData();
        avatarForm.append("file", userAvatarFile);
        const uploadResponse = await fetch(`/api/uploads/avatar`, {
          method: "POST",
          body: avatarForm,
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.url) {
          throw new Error(uploadData.error ?? "Avatar uploaden is mislukt.");
        }
        imageUrl = uploadData.url as string;
      }

      const response = await fetch(`/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userForm.name,
          image: imageUrl,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Profiel bijwerken is mislukt.");
      }

      router.refresh();
      setUserAvatarFile(null);
    } catch (userError) {
      console.error(userError);
      setError((userError as Error).message ?? "Profiel bijwerken is mislukt.");
    } finally {
      setUserSaving(false);
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
    <div className="flex h-screen bg-slate-50 text-slate-900 max-h-screen overflow-hidden">
      {/* Sidebar: Flat, bordered, minimal */}
      <aside className="w-72 shrink-0 border-r border-slate-200/60 bg-white/80 backdrop-blur flex flex-col">
        {/* Header */}
        <div className="">
          <div className="flex items-center gap-3 px-4 pt-4 pb-2">
            <div className="size-9 shrink-0 rounded-xl bg-slate-900 text-white overflow-hidden ring-1 ring-slate-900/10">
              {currentUser.image ? (
                <Image
                  src={currentUser.image}
                  alt={currentUser.name}
                  width={36}
                  height={36}
                  className="size-9 object-cover"
                  unoptimized
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-semibold">
                  {userInitial}
                </span>
              )}
            </div>

            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-900">
                {currentUser.name}
              </p>
              <p className="text-xs text-slate-500">
                {isAdmin ? "Administrator" : "Coach"}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Clients */}
          <div>
            <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Cliënten
            </p>

            <ul className="space-y-1">
              {clients.map((client) => {
                const isActive = client.id === selectedClientId;

                return (
                  <li key={client.id}>
                    <button
                      onClick={() => setSelectedClientId(client.id)}
                      className={[
                        "group w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition",
                        "hover:bg-slate-100/70",
                        isActive
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700",
                      ].join(" ")}
                    >
                      <div className="size-8 rounded-lg overflow-hidden bg-white ring-1 ring-slate-200/70 flex items-center justify-center">
                        {client.avatarUrl ? (
                          <Image
                            src={client.avatarUrl}
                            alt={client.name}
                            width={32}
                            height={32}
                            className="size-8 object-cover"
                            unoptimized
                          />
                        ) : (
                          <UserRound className="size-4 text-slate-400" />
                        )}
                      </div>

                      <span className="truncate text-sm font-medium flex-1">
                        {client.name}
                      </span>

                      {/* subtle active indicator */}
                      <span
                        className={[
                          "h-6 w-0.5 rounded-full transition-opacity",
                          isActive ? "bg-slate-900 opacity-100" : "opacity-0",
                        ].join(" ")}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Tools */}
          <div>
            <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Tools
            </p>

            <ul className="space-y-1">
              {toolLinks.map(({ label, icon: Icon }) => {
                const restricted = label === "Rapportages" && !isAdmin;

                // Settings (kept your dialog logic, streamlined button styling)
                if (label === "Instellingen") {
                  return (
                    <li key={label}>
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100/70">
                            <Icon className="size-4 text-slate-400" />
                            {label}
                          </button>
                        </DialogTrigger>

                        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none sm:max-w-3xl">
                          <div className="flex h-[520px] max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:flex-row">
                            <div className="w-full border-b border-slate-100 bg-slate-50/80 p-4 md:w-[220px] md:border-b-0 md:border-r md:p-6">
                              <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Instellingen
                              </p>
                              <div className="flex flex-row flex-wrap gap-2 md:flex-col md:flex-nowrap">
                                {settingsSections.map((section) => {
                                  const isActive =
                                    section.id === activeSettingsTab;
                                  return (
                                    <button
                                      key={section.id}
                                      type="button"
                                      onClick={() =>
                                        setActiveSettingsTab(section.id)
                                      }
                                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                                        isActive
                                          ? "border-slate-200 bg-white text-slate-900"
                                          : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-900"
                                      }`}
                                    >
                                      {section.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex flex-1 flex-col bg-gradient-to-b from-white to-slate-50/50">
                              <div className="border-b border-slate-100 p-6">
                                <DialogTitle className="text-lg font-semibold text-slate-900">
                                  {activeSettings?.title}
                                </DialogTitle>
                                {activeSettings?.description && (
                                  <DialogDescription className="text-slate-500">
                                    {activeSettings.description}
                                  </DialogDescription>
                                )}
                              </div>
                              <div className="flex-1 overflow-y-auto p-6">
                                {activeSettingsTab === "profile" && (
                                  <form
                                    onSubmit={handleUserSave}
                                    className="space-y-4"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="size-12 overflow-hidden rounded-full bg-slate-100">
                                        {userAvatarFile ? (
                                          <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              src={URL.createObjectURL(
                                                userAvatarFile
                                              )}
                                              alt="Nieuwe avatar"
                                              className="size-12 object-cover"
                                            />
                                          </>
                                        ) : currentUser.image ? (
                                          <Image
                                            src={currentUser.image}
                                            alt={currentUser.name}
                                            width={48}
                                            height={48}
                                            className="size-12 object-cover"
                                            unoptimized
                                          />
                                        ) : (
                                          <UserRound className="size-5 text-slate-400" />
                                        )}
                                      </div>
                                      <label className="text-xs font-medium text-slate-600">
                                        Profielfoto
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="mt-1 text-xs"
                                          onChange={(event) =>
                                            setUserAvatarFile(
                                              event.target.files?.[0] ?? null
                                            )
                                          }
                                        />
                                      </label>
                                    </div>
                                    <label className="flex flex-col gap-1 text-sm">
                                      Naam
                                      <input
                                        type="text"
                                        value={userForm.name}
                                        onChange={(event) =>
                                          setUserForm((form) => ({
                                            ...form,
                                            name: event.target.value,
                                          }))
                                        }
                                        className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                                        required
                                      />
                                    </label>
                                    <p className="text-xs text-slate-500">
                                      Ingelogd als {currentUser.email}
                                    </p>
                                    <button
                                      type="submit"
                                      disabled={isUserSaving}
                                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      {isUserSaving ? "Opslaan..." : "Opslaan"}
                                    </button>
                                  </form>
                                )}
                                {activeSettingsTab === "prompts" && isAdmin && (
                                  <div className="space-y-6">
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
                                            Instructies voor de individuele
                                            coach.
                                          </p>
                                        </div>
                                        <textarea
                                          value={coachPrompt}
                                          onChange={(event) =>
                                            setCoachPrompt(event.target.value)
                                          }
                                          className="min-h-[100px] w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-400 focus:ring-0 outline-none"
                                        />
                                        <div className="flex items-center justify-between text-xs text-slate-500">
                                          <p>
                                            Laatst bijgewerkt:{" "}
                                            {coachPromptUpdatedAt
                                              ? new Date(
                                                  coachPromptUpdatedAt
                                                ).toLocaleString()
                                              : "Onbekend"}
                                          </p>
                                          <button
                                            disabled={isCoachPromptSaving}
                                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                          >
                                            {isCoachPromptSaving
                                              ? "Opslaan..."
                                              : "Opslaan"}
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
                                            Richtlijnen voor programma-analyses
                                            en trends.
                                          </p>
                                        </div>
                                        <textarea
                                          value={overseerPrompt}
                                          onChange={(event) =>
                                            setOverseerPrompt(
                                              event.target.value
                                            )
                                          }
                                          className="min-h-[100px] w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-400 focus:ring-0 outline-none"
                                        />
                                        <div className="flex items-center justify-between text-xs text-slate-500">
                                          <p>
                                            Laatst bijgewerkt:{" "}
                                            {overseerPromptUpdatedAt
                                              ? new Date(
                                                  overseerPromptUpdatedAt
                                                ).toLocaleString()
                                              : "Onbekend"}
                                          </p>
                                          <button
                                            disabled={isOverseerPromptSaving}
                                            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                                          >
                                            {isOverseerPromptSaving
                                              ? "Opslaan..."
                                              : "Opslaan"}
                                          </button>
                                        </div>
                                      </form>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
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
                      className={[
                        "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                        restricted
                          ? "text-slate-400 cursor-not-allowed"
                          : "text-slate-700 hover:bg-slate-100/70",
                      ].join(" ")}
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

        <div className="px-4">
          <div className="h-px bg-slate-200/60" />
        </div>

        {/* Footer */}
        <div className="p-3">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100/70 disabled:opacity-50"
          >
            <LogOut className="size-4 text-slate-400" />
            Uitloggen
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {/* Top Header Bar: Flat, bordered */}
        <header className="h-12 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0">
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
                    <DialogTitle>
                      Gegevens van {selectedClient.name}
                    </DialogTitle>
                    <DialogDescription>
                      Pas de basisinformatie en doelen van de cliënt aan.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleClientSave}>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          avatarFile
                            ? URL.createObjectURL(avatarFile)
                            : selectedClient.avatarUrl ||
                              "/placeholders/avatar.png"
                        }
                        alt={selectedClient.name}
                        className="size-16 rounded-full border border-slate-200 object-cover"
                      />
                      <label className="text-xs font-medium text-slate-600">
                        Profielfoto
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            setAvatarFile(event.target.files?.[0] ?? null)
                          }
                          className="mt-1 text-xs"
                        />
                      </label>
                    </div>
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
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-8xl mx-auto space-y-4 pb-4">
            {/* Context Cards: Flat, white background, thin grey border */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Profile Card */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl bg-slate-100 flex items-center justify-center">
                      {selectedClient?.avatarUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selectedClient.avatarUrl}
                            alt={selectedClient.name}
                            className="size-12 rounded-xl object-cover"
                          />
                        </>
                      ) : (
                        <UserRound className="size-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">
                        Profiel Samenvatting
                      </h3>
                      <p className="text-xs text-slate-500">
                        {selectedClient?.focusArea || "Geen focusgebied"}
                      </p>
                    </div>
                  </div>
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
              <div className="bg-white rounded-xl border border-slate-200 p-4">
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

              {/* AI Insights Panel - Removed amber styling, kept it flat white */}
              <div className="bg-white col-span-3 rounded-xl border border-slate-200 p-6">
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
            </div>

            {/* Bottom Row: Chat Area and Insights Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
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
                  <div className="w-px h-3 bg-[#DDDDDD]" />
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
                      className="p-4 bg-white pt-2 border-slate-200"
                    >
                      <div className="relative flex gap-2">
                        <textarea
                          value={coachInput}
                          onChange={(event) =>
                            setCoachInput(event.target.value)
                          }
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
                        onChange={(event) =>
                          setOverseerInput(event.target.value)
                        }
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
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
