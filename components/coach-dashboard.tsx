"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import type { LucideIcon } from "lucide-react";
import {
  LogOut,
  MessageSquare,
  Paperclip,
  Settings,
  Target,
  CheckCircle2,
  Lightbulb,
  UserRound,
  Plus,
  Sparkles,
  AlertTriangle,
  Edit2,
  ArrowUp,
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
type ModelOption = {
  value: string;
  label: string;
};
type AgentKindType = "COACH" | "OVERSEER";

interface AgentFeedbackItem {
  id: string;
  agentType: AgentKindType;
  messageId: string;
  messageContent: string;
  feedback: string;
  createdAt: string;
  createdBy?: {
    id: string;
    name?: string | null;
  } | null;
}

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

function cleanMessageContent(content: string) {
  return content
    .replace(/\[AI-[^\]]*\]\s*/gi, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s*/gm, "• ")
    .trim();
}

const toolLinks: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Instellingen", icon: Settings },
];

export function CoachDashboard({ clients, currentUser }: CoachDashboardProps) {
  const router = useRouter();
  const [clientList, setClientList] = useState<ClientProfile[]>(clients);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clients[0]?.id ?? null
  );
  const [displayUser, setDisplayUser] = useState(currentUser);
  const [clientHistories, setClientHistories] = useState<HistoryState>({});
  const [clientDocuments, setClientDocuments] = useState<DocumentState>({});
  const [overseerThread, setOverseerThread] = useState<AgentMessage[]>([]);
  const [coachInput, setCoachInput] = useState("");
  const [overseerInput, setOverseerInput] = useState("");
  const [isCoachLoading, setCoachLoading] = useState(false);
  const [isOverseerLoading, setOverseerLoading] = useState(false);
  const [isDocUploading, setDocUploading] = useState(false);
  const [clientReport, setClientReport] = useState<{
    content: string;
    createdAt: string | null;
    id?: string;
  } | null>(null);
  const [isReportGenerating, setReportGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<"coach" | "meta">("coach");
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [isCreateClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState({
    name: "",
    focusArea: "",
    summary: "",
    goals: "",
    avatarUrl: "",
  });
  const [newClientForm, setNewClientForm] = useState({
    name: "",
    focusArea: "",
    summary: "",
    goals: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newClientAvatarFile, setNewClientAvatarFile] = useState<File | null>(
    null
  );
  const [userForm, setUserForm] = useState({
    name: currentUser.name,
    image: currentUser.image ?? "",
  });
  const [userAvatarFile, setUserAvatarFile] = useState<File | null>(null);
  const [isUserSaving, setUserSaving] = useState(false);
  const [isClientSaving, setClientSaving] = useState(false);
  const [isCreatingClient, setCreatingClient] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [coachModel, setCoachModel] = useState("");
  const [overseerModel, setOverseerModel] = useState("");
  const [isModelLoading, setModelLoading] = useState(true);
  const [isModelSaving, setModelSaving] = useState(false);
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
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<{
    agentType: AgentKindType;
    messageId: string;
    messageContent: string;
  } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isFeedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState<AgentFeedbackItem[]>([]);
  const [isFeedbackLoading, setFeedbackLoading] = useState(false);
  const [refineTarget, setRefineTarget] = useState<AgentKindType | null>(null);
  const [isRefiningPrompt, setRefiningPrompt] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<
    "dashboard" | "prompt-center"
  >("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setSigningOut] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("profile");
  const editClientAvatarInputId = useId();
  const newClientAvatarInputId = useId();
  const userAvatarInputId = useId();
  const isAdmin = displayUser.role === "ADMIN";
  const userInitial = displayUser.name?.charAt(0).toUpperCase() ?? "C";
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
    ],
    []
  );
  const activeSettings =
    settingsSections.find((section) => section.id === activeSettingsTab) ??
    settingsSections[0];

  useEffect(() => {
    setClientList(clients);
  }, [clients]);

  useEffect(() => {
    setDisplayUser(currentUser);
  }, [currentUser]);

  const selectedClient = useMemo(
    () => clientList.find((client) => client.id === selectedClientId),
    [clientList, selectedClientId]
  );
  const selectedClientInitials = getInitials(selectedClient?.name);
  const newClientInitials = getInitials(newClientForm.name);

  useEffect(() => {
    if (!selectedClientId) return;
    const alreadyLoaded = clientHistories[selectedClientId];
    if (!alreadyLoaded) {
      void fetchClientHistory(selectedClientId);
    }
    if (!clientDocuments[selectedClientId]) {
      void fetchClientDocuments(selectedClientId);
    }
    void fetchLatestReport(selectedClientId);
  }, [selectedClientId, clientHistories, clientDocuments]);

  useEffect(() => {
    setClientReport(null);
    setReportError(null);
  }, [selectedClientId]);

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
      name: displayUser.name,
      image: displayUser.image ?? "",
    });
    setUserAvatarFile(null);
  }, [displayUser]);

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

  async function fetchLatestReport(clientId: string) {
    try {
      const response = await fetch(`/api/clients/${clientId}/report?limit=1`);
      if (!response.ok) {
        throw new Error("Kan rapport niet ophalen.");
      }
      const data = await response.json();
      const latest = Array.isArray(data.reports) ? data.reports[0] : null;
      if (latest && typeof latest.content === "string") {
        setClientReport({
          content: latest.content,
          createdAt:
            typeof latest.createdAt === "string" ? latest.createdAt : null,
          id: latest.id,
        });
      } else {
        setClientReport(null);
      }
    } catch (fetchError) {
      console.error(fetchError);
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

  const fetchModelSettings = useCallback(async () => {
    if (!isAdmin) {
      setModelLoading(false);
      return;
    }

    setModelLoading(true);
    try {
      const response = await fetch("/api/models");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Kan AI-modellen niet laden.");
      }

      const normalizedOptions: ModelOption[] = Array.isArray(
        data.availableModels
      )
        ? (data.availableModels as ModelOption[]).filter(
            (option) =>
              typeof option?.value === "string" &&
              typeof option?.label === "string"
          )
        : [];

      setAvailableModels(normalizedOptions);
      setCoachModel(typeof data.coachModel === "string" ? data.coachModel : "");
      setOverseerModel(
        typeof data.overseerModel === "string" ? data.overseerModel : ""
      );
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        (fetchError as Error).message ?? "AI-modellen laden is mislukt."
      );
    } finally {
      setModelLoading(false);
    }
  }, [isAdmin]);

  const fetchFeedbackList = useCallback(async () => {
    if (!isAdmin) {
      setRecentFeedback([]);
      setFeedbackLoading(false);
      return;
    }

    setFeedbackLoading(true);
    try {
      const response = await fetch("/api/feedback?limit=20");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Feedback ophalen is mislukt.");
      }
      setRecentFeedback(Array.isArray(data.feedback) ? data.feedback : []);
    } catch (fetchError) {
      console.error(fetchError);
      setError((fetchError as Error).message ?? "Feedback ophalen is mislukt.");
    } finally {
      setFeedbackLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void fetchOverseerThread();
    void fetchCoachPrompt();
    void fetchOverseerPrompt();
    void fetchModelSettings();
  }, [fetchModelSettings]);

  useEffect(() => {
    void fetchFeedbackList();
  }, [fetchFeedbackList]);

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
      scrollToBottom(coachMessagesRef);
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

  async function handleModelSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!coachModel || !overseerModel) {
      setError("Selecteer eerst beide AI-modellen.");
      return;
    }

    setModelSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachModel, overseerModel }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Opslaan van modellen is mislukt.");
      }

      const normalizedOptions: ModelOption[] = Array.isArray(
        data.availableModels
      )
        ? (data.availableModels as ModelOption[]).filter(
            (option) =>
              typeof option?.value === "string" &&
              typeof option?.label === "string"
          )
        : availableModels;

      if (normalizedOptions.length) {
        setAvailableModels(normalizedOptions);
      }

      setCoachModel(
        typeof data.coachModel === "string" ? data.coachModel : coachModel
      );
      setOverseerModel(
        typeof data.overseerModel === "string"
          ? data.overseerModel
          : overseerModel
      );
    } catch (saveError) {
      console.error(saveError);
      setError(
        (saveError as Error).message ?? "AI-modellen opslaan is mislukt."
      );
    } finally {
      setModelSaving(false);
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
      scrollToBottom(overseerMessagesRef);
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

  async function handleGenerateReport() {
    if (!selectedClientId || isReportGenerating) {
      return;
    }
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
      setClientReport({
        content: typeof data.report === "string" ? data.report : "",
        createdAt:
          typeof data.createdAt === "string"
            ? data.createdAt
            : new Date().toISOString(),
        id: typeof data.reportId === "string" ? data.reportId : undefined,
      });
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

  function handleDownloadReport() {
    if (!clientReport?.content) return;
    const blob = new Blob([clientReport.content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = clientReport.createdAt
      ? new Date(clientReport.createdAt)
      : new Date();
    const filename = `${selectedClient?.name ?? "rapport"}-${timestamp
      .toISOString()
      .slice(0, 10)}.txt`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

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
    const clientId = editingClientId ?? selectedClientId;
    if (!clientId) {
      return;
    }

    setClientSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
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

      let latestClient: ClientProfile | undefined = data.client;

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
        const avatarPatch = await fetch(`/api/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            avatarUrl: uploadData.url,
          }),
        });
        const avatarResult = await avatarPatch.json();
        if (!avatarPatch.ok) {
          throw new Error(
            avatarResult.error ?? "Bijwerken van cliëntavatar is mislukt."
          );
        }
        latestClient = avatarResult.client ?? latestClient;
      }

      if (latestClient) {
        const updatedClient = latestClient;
        setClientList((prev) =>
          prev.map((client) =>
            client.id === updatedClient.id ? updatedClient : client
          )
        );
      }

      router.refresh();
      setClientDialogOpen(false);
      setAvatarFile(null);
      setEditingClientId(null);
    } catch (updateError) {
      console.error(updateError);
      setError(
        (updateError as Error).message ?? "Bijwerken van cliënt is mislukt."
      );
    } finally {
      setClientSaving(false);
    }
  }

  async function handleNewClientSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!newClientForm.name.trim()) {
      setError("Naam is verplicht.");
      return;
    }

    setCreatingClient(true);
    setError(null);
    try {
      let avatarUrl: string | undefined;
      if (newClientAvatarFile) {
        const avatarForm = new FormData();
        avatarForm.append("file", newClientAvatarFile);
        const uploadResponse = await fetch(`/api/uploads/avatar`, {
          method: "POST",
          body: avatarForm,
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.url) {
          throw new Error(uploadData.error ?? "Avatar uploaden is mislukt.");
        }
        avatarUrl = uploadData.url as string;
      }

      const response = await fetch(`/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClientForm.name,
          focusArea: newClientForm.focusArea,
          summary: newClientForm.summary,
          goals: newClientForm.goals
            .split(",")
            .map((goal) => goal.trim())
            .filter((goal) => goal.length > 0),
          ...(avatarUrl ? { avatarUrl } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Cliënt aanmaken is mislukt.");
      }

      router.refresh();
      if (data.client?.id) {
        setClientList((prev) => [...prev, data.client]);
        setSelectedClientId(data.client.id);
      }
      setCreateClientDialogOpen(false);
      setNewClientForm({
        name: "",
        focusArea: "",
        summary: "",
        goals: "",
      });
      setNewClientAvatarFile(null);
    } catch (newClientError) {
      console.error(newClientError);
      setError(
        newClientError instanceof Error
          ? newClientError.message
          : "Cliënt aanmaken is mislukt."
      );
    } finally {
      setCreatingClient(false);
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

      setDisplayUser((prev) => ({
        ...prev,
        name: userForm.name,
        image: imageUrl,
      }));
      setUserAvatarFile(null);
      router.refresh();
    } catch (userError) {
      console.error(userError);
      setError((userError as Error).message ?? "Profiel bijwerken is mislukt.");
    } finally {
      setUserSaving(false);
    }
  }

  function openFeedbackDialog(agentType: AgentKindType, message: AgentMessage) {
    setFeedbackTarget({
      agentType,
      messageId: message.id,
      messageContent: message.content,
    });
    setFeedbackText("");
    setFeedbackDialogOpen(true);
  }

  function closeFeedbackDialog() {
    setFeedbackDialogOpen(false);
    setFeedbackTarget(null);
    setFeedbackText("");
  }

  async function handleFeedbackSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedbackTarget || !feedbackText.trim()) {
      setError("Feedback mag niet leeg zijn.");
      return;
    }

    setFeedbackSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: feedbackTarget.agentType,
          messageId: feedbackTarget.messageId,
          feedback: feedbackText,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Feedback versturen is mislukt.");
      }
      closeFeedbackDialog();
      setFeedbackText("");
      await fetchFeedbackList();
    } catch (feedbackError) {
      console.error(feedbackError);
      setError(
        (feedbackError as Error).message ?? "Feedback versturen is mislukt."
      );
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  async function handlePromptRegenerate(agentType: AgentKindType) {
    setRefiningPrompt(true);
    setRefineTarget(agentType);
    setError(null);
    try {
      const response = await fetch("/api/prompts/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Prompt herschrijven is mislukt.");
      }
      if (agentType === "COACH") {
        setCoachPrompt(data.prompt ?? coachPrompt);
        setCoachPromptUpdatedAt(data.updatedAt ?? null);
      } else {
        setOverseerPrompt(data.prompt ?? overseerPrompt);
        setOverseerPromptUpdatedAt(data.updatedAt ?? null);
      }
      await fetchFeedbackList();
    } catch (refineError) {
      console.error(refineError);
      setError(
        (refineError as Error).message ?? "Prompt herschrijven is mislukt."
      );
    } finally {
      setRefiningPrompt(false);
      setRefineTarget(null);
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

  const focusArea = selectedClient?.focusArea ?? "";

  const focusTags = useMemo(() => {
    return focusArea
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }, [focusArea]);

  const coachFeedbackItems = useMemo(
    () =>
      recentFeedback.filter((item) => item.agentType === "COACH").slice(0, 5),
    [recentFeedback]
  );

  const overseerFeedbackItems = useMemo(
    () =>
      recentFeedback
        .filter((item) => item.agentType === "OVERSEER")
        .slice(0, 5),
    [recentFeedback]
  );

  const coachMessagesRef = useRef<HTMLDivElement | null>(null);
  const overseerMessagesRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>) => {
      if (ref.current) {
        ref.current.scrollTo({
          top: ref.current.scrollHeight,
          behavior: "smooth",
        });
      }
    },
    []
  );

  useEffect(() => {
    if (activeChannel === "coach") {
      scrollToBottom(coachMessagesRef);
    }
  }, [messages, activeChannel, scrollToBottom]);

  useEffect(() => {
    if (activeChannel === "meta") {
      scrollToBottom(overseerMessagesRef);
    }
  }, [overseerThread, activeChannel, scrollToBottom]);

  return (
    <>
      <img
        alt="background"
        src="/talenttool-bg.png"
        className="absolute top-0 left-0 opacity-100 w-screen h-screen -z-1"
      />
      {/* Used a very flat light grey background for the app container */}
      <div className="relative flex  h-screen max-h-screen w-full overflow-hidden text-slate-900">
        {/* Sidebar: Flat, bordered, minimal */}
        <aside className="w-72 shrink-0 pt-7 px-1.5 flex flex-col">
          {/* Header */}
          <div className="">
            <div className="flex items-center gap-3 px-3">
              <div className="size-9 shrink-0 rounded-full bg-slate-900 text-white overflow-hidden ring-1 ring-slate-900/10">
                {displayUser.image ? (
                  <Image
                    src={displayUser.image}
                    alt={displayUser.name}
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
                  {displayUser.name}
                </p>
                <p className="text-xs text-slate-500">
                  {isAdmin ? "Administrator" : "Coach"}
                </p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto pl-2 pr-1 py-4 space-y-4">
            {/* Clients */}
            <div>
              <div className="mb-2 flex items-center justify-between pl-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#242424]">
                  Cliënten
                </p>
                {isAdmin && (
                  <Dialog
                    open={isCreateClientDialogOpen}
                    onOpenChange={(open) => {
                      setCreateClientDialogOpen(open);
                      if (!open) {
                        setNewClientForm({
                          name: "",
                          focusArea: "",
                          summary: "",
                          goals: "",
                        });
                        setNewClientAvatarFile(null);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <button className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-100/70">
                        <Plus className="size-3.5" />
                        Nieuw
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl space-y-4">
                      <DialogHeader>
                        <DialogTitle>Nieuwe cliënt</DialogTitle>
                        <DialogDescription>
                          Voeg een nieuwe coachee toe aan het systeem.
                        </DialogDescription>
                      </DialogHeader>
                      <form
                        className="space-y-4"
                        onSubmit={handleNewClientSubmit}
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-16 rounded-full border border-slate-200 bg-slate-50 text-slate-600 overflow-hidden flex items-center justify-center">
                            {newClientAvatarFile ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={URL.createObjectURL(newClientAvatarFile)}
                                  alt="Voorbeeld avatar"
                                  className="size-16 object-cover"
                                />
                              </>
                            ) : newClientInitials ? (
                              <span className="text-base font-semibold">
                                {newClientInitials}
                              </span>
                            ) : (
                              <UserRound className="size-6 text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-700">
                              Profielfoto
                            </p>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                id={newClientAvatarInputId}
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(event) =>
                                  setNewClientAvatarFile(
                                    event.target.files?.[0] ?? null
                                  )
                                }
                              />
                              <label
                                htmlFor={newClientAvatarInputId}
                                className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                              >
                                Kies bestand
                              </label>
                              <span className="text-xs text-slate-500">
                                {newClientAvatarFile
                                  ? newClientAvatarFile.name
                                  : "Geen bestand geselecteerd"}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              PNG of JPG, maximaal 5 MB.
                            </p>
                          </div>
                        </div>
                        <label className="flex flex-col gap-1 text-sm">
                          Naam
                          <input
                            type="text"
                            value={newClientForm.name}
                            onChange={(event) =>
                              setNewClientForm((form) => ({
                                ...form,
                                name: event.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                            required
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                          Focusgebied
                          <input
                            type="text"
                            value={newClientForm.focusArea}
                            onChange={(event) =>
                              setNewClientForm((form) => ({
                                ...form,
                                focusArea: event.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                          Samenvatting
                          <textarea
                            value={newClientForm.summary}
                            onChange={(event) =>
                              setNewClientForm((form) => ({
                                ...form,
                                summary: event.target.value,
                              }))
                            }
                            rows={4}
                            className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                          Doelen (gescheiden door komma)
                          <textarea
                            value={newClientForm.goals}
                            onChange={(event) =>
                              setNewClientForm((form) => ({
                                ...form,
                                goals: event.target.value,
                              }))
                            }
                            rows={3}
                            className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                            placeholder="Bijv. Communicatie verbeteren, Energie bewaken"
                          />
                        </label>
                        <div className="flex justify-end gap-2 text-sm">
                          <button
                            type="button"
                            onClick={() => setCreateClientDialogOpen(false)}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
                          >
                            Annuleren
                          </button>
                          <button
                            type="submit"
                            disabled={isCreatingClient}
                            className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                          >
                            {isCreatingClient ? "Opslaan..." : "Opslaan"}
                          </button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <ul className="space-y-0.5">
                {clientList.map((client) => {
                  const isActive = client.id === selectedClientId;

                  return (
                    <li key={client.id}>
                      <button
                        onClick={() => {
                          setSelectedClientId(client.id);
                          setActiveSidebarTab("dashboard");
                        }}
                        className={[
                          "group w-full flex items-center gap-3 border border-transparent rounded-lg px-2 py-2 text-left transition",
                          "hover:bg-white/40 hover:border-white/40",
                          isActive
                            ? "bg-white/40 border-white/50 text-[#242424]"
                            : "text-[#242424]",
                        ].join(" ")}
                      >
                        <div className="size-7 rounded-full overflow-hidden bg-[#242424] ring-1 ring-slate-200/70 flex items-center justify-center">
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
                            <UserRound className="size-4 text-white" />
                          )}
                        </div>

                        <span className="truncate text-sm font-medium flex-1">
                          {client.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Tools */}
            <div>
              <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                Tools
              </p>

              <ul className="space-y-1">
                {isAdmin && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveSidebarTab("prompt-center")}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                        activeSidebarTab === "prompt-center"
                          ? ""
                          : "text-slate-700 hover:bg-slate-100/70",
                      ].join(" ")}
                    >
                      <Sparkles className="size-4 text-blue-300" />
                      AI Promptcenter
                    </button>
                  </li>
                )}
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
                                        <div className="size-16 rounded-full border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center overflow-hidden">
                                          {userAvatarFile ? (
                                            <>
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img
                                                src={URL.createObjectURL(
                                                  userAvatarFile
                                                )}
                                                alt="Nieuwe avatar"
                                                className="size-16 object-cover"
                                              />
                                            </>
                                          ) : displayUser.image ? (
                                            <Image
                                              src={displayUser.image}
                                              alt={displayUser.name}
                                              width={64}
                                              height={64}
                                              className="size-16 object-cover"
                                              unoptimized
                                            />
                                          ) : displayUser.name ? (
                                            <span className="text-base font-semibold">
                                              {getInitials(displayUser.name)}
                                            </span>
                                          ) : (
                                            <UserRound className="size-6 text-slate-400" />
                                          )}
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold text-slate-700">
                                            Profielfoto
                                          </p>
                                          <div className="mt-1 flex items-center gap-2">
                                            <input
                                              id={userAvatarInputId}
                                              type="file"
                                              accept="image/*"
                                              className="sr-only"
                                              onChange={(event) =>
                                                setUserAvatarFile(
                                                  event.target.files?.[0] ??
                                                    null
                                                )
                                              }
                                            />
                                            <label
                                              htmlFor={userAvatarInputId}
                                              className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                                            >
                                              Kies bestand
                                            </label>
                                            <span className="text-xs text-slate-500">
                                              {userAvatarFile
                                                ? userAvatarFile.name
                                                : displayUser.image
                                                ? "Huidige foto ingesteld"
                                                : "Geen bestand geselecteerd"}
                                            </span>
                                          </div>
                                          <p className="mt-1 text-[11px] text-slate-500">
                                            PNG of JPG, maximaal 5 MB.
                                          </p>
                                        </div>
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
                                        Ingelogd als {displayUser.email}
                                      </p>
                                      <button
                                        type="submit"
                                        disabled={isUserSaving}
                                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        {isUserSaving
                                          ? "Opslaan..."
                                          : "Opslaan"}
                                      </button>
                                    </form>
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
        <main className="flex-1 flex min-h-0 flex-col min-w-0 overflow-hidden">
          {activeSidebarTab === "prompt-center" ? (
            <div className="flex h-full flex-col">
              <header className="relative z-10 flex h-16 shrink-0 items-center justify-between border-b border-white/30 bg-white/60 px-8 backdrop-blur-xl">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">
                    Prompthistorie &amp; Feedback
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSidebarTab("dashboard")}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
                  >
                    Terug naar dashboard
                  </button>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-8xl flex-col gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          AI-modellen
                        </p>
                        <p className="text-xs text-slate-500">
                          Kies welk model beide agenten gebruiken.
                        </p>
                      </div>
                    </div>
                    {isModelLoading ? (
                      <p className="mt-3 text-sm text-slate-500">
                        Modellen worden geladen...
                      </p>
                    ) : availableModels.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        Geen beschikbare modellen gevonden.
                      </p>
                    ) : (
                      <form
                        onSubmit={handleModelSave}
                        className="mt-4 grid gap-4 lg:grid-cols-2"
                      >
                        <label className="flex flex-col gap-1 text-sm">
                          Coach assistent
                          <select
                            value={coachModel}
                            onChange={(event) =>
                              setCoachModel(event.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-slate-900 focus:outline-none"
                            required
                          >
                            <option value="" disabled>
                              Kies een model
                            </option>
                            {availableModels.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-slate-500">
                            Wordt gebruikt voor cliëntgesprekken.
                          </span>
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                          Overzichtscoach
                          <select
                            value={overseerModel}
                            onChange={(event) =>
                              setOverseerModel(event.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-slate-900 focus:outline-none"
                            required
                          >
                            <option value="" disabled>
                              Kies een model
                            </option>
                            {availableModels.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-slate-500">
                            Voor trendanalyses en overzichten.
                          </span>
                        </label>
                        <div className="lg:col-span-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={isModelSaving}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {isModelSaving
                              ? "Opslaan..."
                              : "AI-modellen opslaan"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {isCoachPromptLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                        Coachprompt wordt geladen...
                      </div>
                    ) : (
                      <form
                        onSubmit={handleCoachPromptSave}
                        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-start justify-between gap-10">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Coachprompt
                              </p>
                              <p className="text-xs text-slate-500">
                                Laatste update:{" "}
                                {coachPromptUpdatedAt
                                  ? new Date(
                                      coachPromptUpdatedAt
                                    ).toLocaleString()
                                  : "Onbekend"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePromptRegenerate("COACH")}
                              disabled={
                                isRefiningPrompt && refineTarget === "COACH"
                              }
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {isRefiningPrompt && refineTarget === "COACH"
                                ? "Herschrijven..."
                                : "Herschrijf met feedback"}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500">
                            Gebruik dit om de toon en structuur van
                            cliëntcoaching te sturen.
                          </p>
                        </div>
                        <textarea
                          value={coachPrompt}
                          onChange={(event) =>
                            setCoachPrompt(event.target.value)
                          }
                          className="min-h-[250px] w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-400 focus:outline-none"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={isCoachPromptSaving}
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {isCoachPromptSaving ? "Opslaan..." : "Opslaan"}
                          </button>
                        </div>
                      </form>
                    )}

                    {isOverseerPromptLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                        Overzichtsprompt wordt geladen...
                      </div>
                    ) : (
                      <form
                        onSubmit={handleOverseerPromptSave}
                        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-1 ">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Overzichtscoach prompt
                              </p>
                              <p className="text-xs text-slate-500">
                                Laatste update:{" "}
                                {overseerPromptUpdatedAt
                                  ? new Date(
                                      overseerPromptUpdatedAt
                                    ).toLocaleString()
                                  : "Onbekend"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePromptRegenerate("OVERSEER")}
                              disabled={
                                isRefiningPrompt && refineTarget === "OVERSEER"
                              }
                              className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-white disabled:opacity-50"
                            >
                              {isRefiningPrompt && refineTarget === "OVERSEER"
                                ? "Herschrijven..."
                                : "Herschrijf met feedback"}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500">
                            Richtlijnen voor trend- en risicoanalyses.
                          </p>
                        </div>
                        <textarea
                          value={overseerPrompt}
                          onChange={(event) =>
                            setOverseerPrompt(event.target.value)
                          }
                          className="min-h-[250px] w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-400 focus:outline-none"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={isOverseerPromptSaving}
                            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                          >
                            {isOverseerPromptSaving ? "Opslaan..." : "Opslaan"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Feedback coach assistent
                          </p>
                          <p className="text-xs text-slate-500">
                            Laatste {coachFeedbackItems.length || 0} items
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {coachFeedbackItems.length}
                        </span>
                      </div>
                      {isFeedbackLoading ? (
                        <p className="mt-3 text-sm text-slate-500">
                          Feedback wordt geladen...
                        </p>
                      ) : coachFeedbackItems.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">
                          Nog geen feedback voor deze agent.
                        </p>
                      ) : (
                        <ul className="mt-4 space-y-3">
                          {coachFeedbackItems.map((item) => (
                            <li
                              key={item.id}
                              className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                            >
                              <p className="text-[11px] uppercase text-slate-400">
                                {new Date(item.createdAt).toLocaleString()}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {item.feedback}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Feedback overzichtscoach
                          </p>
                          <p className="text-xs text-slate-500">
                            Laatste {overseerFeedbackItems.length || 0} items
                          </p>
                        </div>
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                          {overseerFeedbackItems.length}
                        </span>
                      </div>
                      {isFeedbackLoading ? (
                        <p className="mt-3 text-sm text-slate-500">
                          Feedback wordt geladen...
                        </p>
                      ) : overseerFeedbackItems.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">
                          Nog geen feedback voor deze agent.
                        </p>
                      ) : (
                        <ul className="mt-4 space-y-3">
                          {overseerFeedbackItems.map((item) => (
                            <li
                              key={item.id}
                              className="rounded-xl border border-purple-100 bg-purple-50/40 p-3"
                            >
                              <p className="text-[11px] uppercase text-purple-400">
                                {new Date(item.createdAt).toLocaleString()}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                {item.feedback}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="relative flex-1 min-h-0 overflow-hidden p-2">
                <div
                  className="
    relative flex h-full min-h-0 gap-4
    rounded-[36px]
    overflow-hidden

    bg-white/25
    backdrop-blur-2xl backdrop-saturate-120

    p-4
    pt-0
    text-sm text-slate-800

  "
                >
                  {/* Border */}
                  <div className="pointer-events-none absolute inset-0 rounded-[36px] border border-white z-10" />

                  {/* Top highlight */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[36px]
  bg-gradient-to-b from-white/45 via-white/18 to-transparent z-10"
                  />

                  {/* Actual content */}
                  <section className="flex flex-1 relative z-20  min-h-0 flex-col rounded-2xl">
                    <div className="flex min-h-0 flex-1 flex-col">
                      {activeChannel === "coach" ? (
                        <>
                          <div
                            ref={coachMessagesRef}
                            className="flex-1 space-y-3 overflow-y-auto px-5 py-5"
                          >
                            {messages.length === 0 ? (
                              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                                <MessageSquare className="size-5" />
                                <p>Start een gesprek met je cliënt.</p>
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
                                      className={`max-w-[75%] rounded-3xl leading-relaxed ${
                                        isAi
                                          ? " bg-white p-5 text-slate-900"
                                          : "bg-[#222222] p-3 text-white"
                                      }`}
                                    >
                                      <p className="whitespace-pre-wrap">
                                        {cleanMessageContent(message.content)}
                                      </p>
                                      {isAdmin &&
                                        message.role === "assistant" &&
                                        isAi && (
                                          <div className="mt-2 text-[10px]">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                openFeedbackDialog(
                                                  "COACH",
                                                  message
                                                )
                                              }
                                              className="inline-flex items-center gap-1 text-red-500 underline-offset-2 hover:underline"
                                            >
                                              <AlertTriangle className="size-3" />
                                              Feedback
                                            </button>
                                          </div>
                                        )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          <form
                            onSubmit={handleCoachSubmit}
                            className="px-4 pb-4"
                          >
                            <div className="rounded-3xl relative bg-[#FFFF] border">
                              <textarea
                                value={coachInput}
                                onChange={(event) =>
                                  setCoachInput(event.target.value)
                                }
                                placeholder="Schrijf een bericht..."
                                className="h-30 w-full resize-none rounded-lg border border-transparent p-3 text-sm text-slate-900 focus:outline-none"
                                rows={3}
                              />
                              <div className="mt-2 flex items-center justify-between text-xs">
                                <button
                                  type="button"
                                  onClick={handleAttachmentButtonClick}
                                  className="inline-flex items-center gap-1 absolute bottom-2 mr-2 bg-white aspect-square right-12 rounded-full border border-slate-200 px-3 text-slate-600"
                                >
                                  <Paperclip className="size-3.5" />
                                </button>
                                <button
                                  type="submit"
                                  disabled={!selectedClient || isCoachLoading}
                                  className="inline-flex items-center gap-2  aspect-square rounded-full bg-slate-900 px-3 absolute bottom-2 right-2 text-white disabled:opacity-50"
                                >
                                  <ArrowUp className="size-4" />
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
                        </>
                      ) : (
                        <>
                          <div
                            ref={overseerMessagesRef}
                            className="flex-1 space-y-3 overflow-y-auto px-5 py-5"
                          >
                            {overseerThread.length === 0 ? (
                              <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-500">
                                Vraag de overzichtscoach naar trends en
                                signalen.
                              </div>
                            ) : (
                              overseerThread.map((message) => (
                                <div
                                  key={message.id}
                                  className={`rounded-xl border px-4 py-2 ${
                                    message.role === "assistant"
                                      ? "border-purple-200 bg-white"
                                      : "border-slate-200 bg-slate-50"
                                  }`}
                                >
                                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                    {message.role}
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                                    {cleanMessageContent(message.content)}
                                  </p>
                                  {isAdmin && message.role === "assistant" && (
                                    <div className="mt-1 text-right text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openFeedbackDialog(
                                            "OVERSEER",
                                            message
                                          )
                                        }
                                        className="text-purple-600 underline-offset-2 hover:underline"
                                      >
                                        Feedback
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                          <form
                            onSubmit={handleOverseerSubmit}
                            className="px-4 py-4"
                          >
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <textarea
                                value={overseerInput}
                                onChange={(event) =>
                                  setOverseerInput(event.target.value)
                                }
                                placeholder="Vraag naar trends, risico's..."
                                disabled={isOverseerLoading}
                                className="h-24 w-full resize-none rounded-lg border border-transparent bg-slate-50 p-3 text-sm text-slate-900 focus:border-purple-200 focus:outline-none"
                                rows={3}
                              />
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="submit"
                                  disabled={
                                    !overseerInput.trim() || isOverseerLoading
                                  }
                                  className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-1.5 text-white hover:bg-purple-500 disabled:opacity-50"
                                >
                                  Verstuur
                                </button>
                              </div>
                            </div>
                          </form>
                        </>
                      )}
                    </div>
                  </section>
                  <aside className="min-h-0 relative z-20 w-full shrink-0 text-sm pt-3 text-slate-700 lg:w-84">
                    <div className="inline-flex items-center rounded-full border mb-4 border-slate-200 bg-slate-50 p-1.5 text-xs font-medium text-slate-600">
                      <button
                        onClick={() => setActiveChannel("coach")}
                        className={`rounded-full px-4 py-1.5 transition ${
                          activeChannel === "coach"
                            ? "bg-white text-slate-900 shadow"
                            : "hover:text-slate-900"
                        }`}
                      >
                        Coach assistent
                      </button>
                      <button
                        onClick={() => setActiveChannel("meta")}
                        className={`rounded-full px-4 py-1.5 transition ${
                          activeChannel === "meta"
                            ? "bg-white text-slate-900 shadow"
                            : "hover:text-slate-900"
                        }`}
                      >
                        Meta twin
                      </button>
                    </div>
                    <div className="space-y-4 overflow-y-auto max-h-[92vh] pb-8">
                      <div className="rounded-3xl bg-white p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                            {selectedClient?.avatarUrl ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={selectedClient.avatarUrl}
                                  alt={selectedClient.name}
                                  className="size-10 rounded-lg object-cover"
                                />
                              </>
                            ) : selectedClientInitials ? (
                              <span className="text-sm font-semibold">
                                {selectedClientInitials}
                              </span>
                            ) : (
                              <UserRound className="size-4" />
                            )}
                          </div>
                          <div>
                            {" "}
                            <p className="text-sm font-semibold text-slate-900">
                              {selectedClient?.name ?? "Geen cliënt"}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {selectedClient?.focusArea || "Geen focus"}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
                          {selectedClient?.summary ||
                            "Selecteer een cliënt om details te bekijken."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {focusTags.length > 0 ? (
                            focusTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Geen trefwoorden
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-3xl bg-white p-4">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-foreground font-semibold">
                          <span>Doelen</span>
                          <span className="text-slate-400">
                            {selectedClient?.goals.length ?? 0}
                          </span>
                        </div>
                        <ul className="mt-3 space-y-2">
                          {selectedClient?.goals.length ? (
                            selectedClient.goals.map((goal, index) => (
                              <li
                                key={`${goal}-${index}`}
                                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px]"
                              >
                                {goal}
                              </li>
                            ))
                          ) : (
                            <p className="text-[13px] text-slate-500">
                              Geen doelen ingesteld.
                            </p>
                          )}
                        </ul>
                      </div>
                      <div className="rounded-3xl bg-white p-4">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-foreground font-semibold">
                          <span>Documenten</span>
                          <span className="text-slate-400">
                            {documents.length}
                          </span>
                        </div>
                        {documents.length === 0 ? (
                          <p className="mt-2 text-[13px] text-slate-500">
                            Nog geen bestanden.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {documents.map((doc) => (
                              <div
                                key={doc.id}
                                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                              >
                                <p className="truncate text-[13px] font-medium text-slate-900">
                                  {doc.originalName}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {(doc.size / 1024).toFixed(1)} KB •{" "}
                                  {doc.kind === "AUDIO" ? "Audio" : "Tekst"}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="rounded-3xl bg-white p-4">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-foreground font-semibold">
                          <span>Rapport</span>
                          <div className="inline-flex items-center gap-2">
                            {clientReport?.content && (
                              <button
                                type="button"
                                onClick={handleDownloadReport}
                                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                              >
                                Download
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleGenerateReport}
                              disabled={!selectedClientId || isReportGenerating}
                              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {isReportGenerating ? "Bezig..." : "Genereer"}
                            </button>
                          </div>
                        </div>
                        {reportError && (
                          <p className="mt-2 text-[12px] text-red-500">
                            {reportError}
                          </p>
                        )}
                        {clientReport?.createdAt && (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Laatste rapport:{" "}
                            {new Date(clientReport.createdAt).toLocaleString()}
                          </p>
                        )}
                        <div className="mt-3 min-h-[90px] rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-700 whitespace-pre-wrap">
                          {clientReport?.content
                            ? clientReport.content
                            : "Nog geen rapport gegenereerd."}
                        </div>
                      </div>
                      <div className="rounded-3xl bg-white p-4">
                        <p className="text-[11px] uppercase tracking-wide text-foreground font-semibold">
                          Sterktes & aandacht
                        </p>
                        <ul className="mt-3 space-y-2">
                          {strengthsAndWatchouts.map((item, idx) => (
                            <li
                              key={`${item}-${idx}`}
                              className="text-[13px] text-slate-700"
                            >
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <Dialog
        open={feedbackDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeFeedbackDialog();
          } else {
            setFeedbackDialogOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Geef feedback op AI-antwoord</DialogTitle>
            <DialogDescription>
              Beschrijf hoe de{" "}
              {feedbackTarget?.agentType === "OVERSEER"
                ? "overzichtscoach"
                : "coach assistent"}{" "}
              het antwoord kan verbeteren.
            </DialogDescription>
          </DialogHeader>
          {feedbackTarget ? (
            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
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
                <span className="font-medium text-slate-900">
                  Jouw feedback
                </span>
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
                  onClick={closeFeedbackDialog}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={isFeedbackSubmitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isFeedbackSubmitting ? "Versturen..." : "Verstuur feedback"}
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
    </>
  );
}
