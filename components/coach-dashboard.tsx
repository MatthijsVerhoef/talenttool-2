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
  Download,
  Settings,
  UserRound,
  Plus,
  Sparkles,
  AlertTriangle,
  Edit2,
  ArrowUp,
  ArrowLeft,
  ShieldCheck,
  Trash2,
  Loader2,
  FileText,
} from "lucide-react";
import type { UserRole } from "@prisma/client";
import { toast } from "sonner";

import { signOutUser } from "@/lib/auth-client";
import { AdminUserManagement } from "@/components/admin/user-management";
import { VoiceRecorder } from "@/components/chat/voice-recorder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

import type {
  AgentMessage,
  ClientDocument,
  ClientProfile,
} from "@/lib/data/store";
import { useIsMobile } from "@/hooks/use-mobile";

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
type ClientPendingState = Record<string, boolean>;
type ClientRequestState = Record<string, string | null>;
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

type AiLayerTarget = "ALL" | "COACH" | "OVERSEER";

interface AiResponseLayerRow {
  id: string;
  name: string;
  description: string;
  instructions: string;
  target: AiLayerTarget;
  model: string;
  temperature: number;
  position: number;
  isEnabled: boolean;
  createdAt: string;
}

interface ActiveCoachRequest {
  requestId: string;
  controller: AbortController;
  userTempId: string;
  assistantTempId: string;
}

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

function formatFileSize(bytes?: number | null) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function cleanMessageContent(content: string) {
  return content
    .replace(/\[AI-[^\]]*\]\s*/gi, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s*/gm, "• ")
    .trim();
}

function renderUserAvatarElement(name?: string | null, image?: string | null) {
  if (image) {
    return (
      <Image
        src={image}
        alt={name ?? "Coach"}
        width={36}
        height={36}
        className="h-9 w-9 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
      <span className="text-xs font-semibold">{getInitials(name) || "J"}</span>
    </div>
  );
}

function isPendingAgentMessage(message: AgentMessage) {
  if (!message.meta || typeof message.meta !== "object") {
    return false;
  }
  return Boolean((message.meta as { pending?: boolean }).pending);
}

const toolLinks: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Instellingen", icon: Settings },
];

export function CoachDashboard({ clients, currentUser }: CoachDashboardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
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
  const [coachPendingByClientId, setCoachPendingByClientId] =
    useState<ClientPendingState>({});
  const [coachLastRequestIdByClientId, setCoachLastRequestIdByClientId] =
    useState<ClientRequestState>({});
  const [queuedTranscriptByClientId, setQueuedTranscriptByClientId] = useState<
    Record<string, string>
  >({});
  const [autoSendAfterTranscription, setAutoSendAfterTranscription] =
    useState(false);
  const [isOverseerLoading, setOverseerLoading] = useState(false);
  const [isDocUploading, setDocUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null
  );
  const [clientReports, setClientReports] = useState<
    Record<
      string,
      {
        content: string;
        createdAt: string | null;
        id: string;
      }[]
    >
  >({});
  const clientReportList = selectedClientId
    ? clientReports[selectedClientId] ?? []
    : [];
  const [isReportGenerating, setReportGenerating] = useState(false);
  const [isReportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<"coach" | "meta">("coach");
  const [mobileView, setMobileView] = useState<"list" | "chat" | "details">(
    () => {
      if (typeof window === "undefined") {
        return "chat";
      }
      return window.innerWidth < 768 ? "list" : "chat";
    }
  );
  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [isCreateClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState({
    name: "",
    focusArea: "",
    summary: "",
    goals: "",
    avatarUrl: "",
    coachId: "",
  });
  const [newClientForm, setNewClientForm] = useState({
    name: "",
    focusArea: "",
    summary: "",
    goals: "",
    coachId: "",
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
  const [reportPrompt, setReportPrompt] = useState("");
  const [reportPromptUpdatedAt, setReportPromptUpdatedAt] = useState<
    string | null
  >(null);
  const [isReportPromptLoading, setReportPromptLoading] = useState(true);
  const [isReportPromptSaving, setReportPromptSaving] = useState(false);
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
    "dashboard" | "prompt-center" | "user-management"
  >("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setSigningOut] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("profile");
  const [coachOptions, setCoachOptions] = useState<
    Array<{ id: string; name?: string | null; email: string }>
  >([]);
  const [isCoachOptionsLoading, setCoachOptionsLoading] = useState(false);
  const [coachOptionsError, setCoachOptionsError] = useState<string | null>(
    null
  );
  const [hasRequestedCoachOptions, setHasRequestedCoachOptions] =
    useState(false);
  const [aiLayers, setAiLayers] = useState<AiResponseLayerRow[]>([]);
  const [isLayerLoading, setLayerLoading] = useState(false);
  const [isLayerSaving, setLayerSaving] = useState(false);
  const [layerDialogOpen, setLayerDialogOpen] = useState(false);
  const [editingLayer, setEditingLayer] = useState<AiResponseLayerRow | null>(
    null
  );
  const [layerForm, setLayerForm] = useState({
    name: "",
    description: "",
    instructions: "",
    target: "COACH" as AiLayerTarget,
    model: "",
    temperature: 0.2,
    isEnabled: true,
  });
  const [layerActionId, setLayerActionId] = useState<string | null>(null);
  const [layerActionType, setLayerActionType] = useState<
    "toggle" | "delete" | null
  >(null);
  const editClientAvatarInputId = useId();
  const newClientAvatarInputId = useId();
  const userAvatarInputId = useId();
  const activeCoachRequestsRef = useRef<Record<string, ActiveCoachRequest>>({});
  const queuedTranscriptByClientIdRef = useRef<Record<string, string>>({});
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
  const getDefaultLayerForm = useCallback(
    () => ({
      name: "",
      description: "",
      instructions: "",
      target: "COACH" as AiLayerTarget,
      model: coachModel || overseerModel || availableModels[0]?.value || "",
      temperature: 0.2,
      isEnabled: true,
    }),
    [availableModels, coachModel, overseerModel]
  );
  const layerTargetLabels: Record<AiLayerTarget, string> = {
    COACH: "Coachkanaal",
    OVERSEER: "Overzichtscoach",
    ALL: "Beide agenten",
  };
  const getModelLabel = useCallback(
    (value: string) =>
      availableModels.find((option) => option.value === value)?.label ?? value,
    [availableModels]
  );

  useEffect(() => {
    if (!isAdmin || hasRequestedCoachOptions) {
      return;
    }
    setHasRequestedCoachOptions(true);
    setCoachOptionsLoading(true);
    setCoachOptionsError(null);

    const loadCoaches = async () => {
      try {
        const response = await fetch("/api/admin/coaches");
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? "Kan coaches niet ophalen.");
        }
        setCoachOptions(Array.isArray(data.coaches) ? data.coaches : []);
      } catch (fetchError) {
        console.error(fetchError);
        setCoachOptionsError(
          fetchError instanceof Error
            ? fetchError.message
            : "Kan coaches niet ophalen."
        );
        setHasRequestedCoachOptions(false);
      } finally {
        setCoachOptionsLoading(false);
      }
    };

    void loadCoaches();
  }, [isAdmin, hasRequestedCoachOptions]);
  const activeSettings =
    settingsSections.find((section) => section.id === activeSettingsTab) ??
    settingsSections[0];

  useEffect(() => {
    setClientList(clients);
  }, [clients]);

  useEffect(() => {
    setDisplayUser(currentUser);
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("autoSendAfterTranscription");
    setAutoSendAfterTranscription(stored === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      "autoSendAfterTranscription",
      autoSendAfterTranscription ? "1" : "0"
    );
  }, [autoSendAfterTranscription]);

  useEffect(() => {
    if (!isAdmin && activeSidebarTab !== "dashboard") {
      setActiveSidebarTab("dashboard");
    }
  }, [isAdmin, activeSidebarTab]);

  useEffect(() => {
    if (!isAdmin && activeChannel === "meta") {
      setActiveChannel("coach");
    }
  }, [isAdmin, activeChannel]);

  useEffect(() => {
    if (!isMobile && mobileView !== "chat") {
      setMobileView("chat");
      return;
    }
    if (isMobile && activeSidebarTab !== "dashboard" && mobileView !== "chat") {
      setMobileView("chat");
    }
  }, [isMobile, activeSidebarTab, mobileView]);

  const selectedClient = useMemo(
    () => clientList.find((client) => client.id === selectedClientId),
    [clientList, selectedClientId]
  );
  const clientNameById = useMemo(
    () =>
      clientList.reduce<Record<string, string>>((acc, client) => {
        acc[client.id] = client.name;
        return acc;
      }, {}),
    [clientList]
  );
  const selectedClientInitials = getInitials(selectedClient?.name);
  const newClientInitials = getInitials(newClientForm.name);
  const isDashboardTab = activeSidebarTab === "dashboard";
  const showSidebar = !isMobile || mobileView === "list";
  const showMainContent = !isMobile || mobileView !== "list";
  const isMobileDashboardChat =
    isMobile && isDashboardTab && mobileView === "chat";
  const isMobileDetailsView =
    isMobile && isDashboardTab && mobileView === "details";
  const showMenuButton = isMobile && mobileView !== "list";

  const selectedClientHistory = selectedClientId
    ? clientHistories[selectedClientId]
    : undefined;
  const selectedClientDocs = selectedClientId
    ? clientDocuments[selectedClientId]
    : undefined;
  const isSelectedClientCoachPending = selectedClientId
    ? Boolean(coachPendingByClientId[selectedClientId])
    : false;

  const clearCoachPendingState = useCallback((clientId: string) => {
    setCoachPendingByClientId((prev) => {
      if (!prev[clientId]) {
        return prev;
      }
      return {
        ...prev,
        [clientId]: false,
      };
    });
  }, []);

  const removeCoachTempMessages = useCallback(
    (clientId: string, userTempId: string, assistantTempId: string) => {
      setClientHistories((prev) => {
        const prevHistory = prev[clientId] ?? [];
        return {
          ...prev,
          [clientId]: prevHistory.filter(
            (message) =>
              message.id !== userTempId && message.id !== assistantTempId
          ),
        };
      });
    },
    []
  );

  const queueTranscriptForClient = useCallback(
    (clientId: string, transcript: string) => {
      const existing = queuedTranscriptByClientIdRef.current[clientId];
      const nextQueue = {
        ...queuedTranscriptByClientIdRef.current,
        [clientId]: existing
          ? `${existing.trim()} ${transcript.trim()}`
          : transcript.trim(),
      };
      queuedTranscriptByClientIdRef.current = nextQueue;
      setQueuedTranscriptByClientId(nextQueue);
    },
    []
  );

  const popQueuedTranscriptForClient = useCallback((clientId: string) => {
    const queued = queuedTranscriptByClientIdRef.current[clientId];
    if (!queued) {
      return null;
    }
    const nextQueue = { ...queuedTranscriptByClientIdRef.current };
    delete nextQueue[clientId];
    queuedTranscriptByClientIdRef.current = nextQueue;
    setQueuedTranscriptByClientId(nextQueue);
    return queued;
  }, []);

  useEffect(() => {
    return () => {
      const activeRequests = Object.values(activeCoachRequestsRef.current);
      for (const request of activeRequests) {
        request.controller.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    if (!selectedClientHistory) {
      void fetchClientHistory(selectedClientId);
    }
    if (!selectedClientDocs) {
      void fetchClientDocuments(selectedClientId);
    }
  }, [selectedClientId, selectedClientHistory, selectedClientDocs]);

  useEffect(() => {
    if (!selectedClientId) return;
    void fetchClientReports(selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    setReportError(null);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(clientReports, selectedClientId)) {
      return;
    }
    let cancelled = false;
    setReportLoading(true);
    setReportError(null);
    void fetchClientReports(selectedClientId)
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        console.error(fetchError);
        setReportError(
          fetchError instanceof Error
            ? fetchError.message
            : "Kan rapport niet ophalen."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setReportLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClientId, clientReports]);

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
      coachId: selectedClient.coachId ?? "",
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
      const response = await fetch(`/api/coach/${clientId}`, {
        credentials: "include",
      });
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

  const fetchOverseerThread = useCallback(async () => {
    if (!isAdmin) {
      setOverseerThread([]);
      return;
    }
    try {
      const response = await fetch("/api/overseer");
      if (!response.ok) throw new Error("Kan overview-gesprek niet laden.");
      const data = await response.json();
      setOverseerThread(data.thread ?? []);
    } catch (fetchError) {
      console.error(fetchError);
    }
  }, [isAdmin]);

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

  async function fetchClientReports(clientId: string) {
    const response = await fetch(`/api/clients/${clientId}/report?limit=5`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : "Kan rapport niet ophalen."
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
            ): entry is {
              id?: unknown;
              content?: unknown;
              createdAt?: unknown;
            } => Boolean(entry)
          )
          .map(
            (entry: {
              id?: unknown;
              content?: unknown;
              createdAt?: unknown;
            }) => {
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
            }
          )
      : [];
    setClientReports((prev) => ({
      ...prev,
      [clientId]: reports,
    }));
  }

  const fetchCoachPrompt = useCallback(async () => {
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
  }, []);

  const fetchOverseerPrompt = useCallback(async () => {
    if (!isAdmin) {
      setOverseerPrompt("");
      setOverseerPromptUpdatedAt(null);
      return;
    }
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
  }, [isAdmin]);

  const fetchReportPrompt = useCallback(async () => {
    if (!isAdmin) {
      setReportPrompt("");
      setReportPromptUpdatedAt(null);
      setReportPromptLoading(false);
      return;
    }
    setReportPromptLoading(true);
    try {
      const response = await fetch("/api/prompts/report");
      if (!response.ok) throw new Error("Kan rapportprompt niet laden.");
      const data = await response.json();
      setReportPrompt(data.prompt ?? "");
      setReportPromptUpdatedAt(data.updatedAt ?? null);
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        (fetchError as Error).message ?? "Rapportprompt laden is mislukt."
      );
    } finally {
      setReportPromptLoading(false);
    }
  }, [isAdmin]);

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

  const fetchAiLayers = useCallback(async () => {
    if (!isAdmin) {
      setAiLayers([]);
      setLayerLoading(false);
      return;
    }

    setLayerLoading(true);
    try {
      const response = await fetch("/api/ai-layers");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Kan AI-lagen niet laden.");
      }
      setAiLayers(Array.isArray(data.layers) ? data.layers : []);
    } catch (fetchError) {
      console.error(fetchError);
      setError((fetchError as Error).message ?? "AI-lagen laden is mislukt.");
    } finally {
      setLayerLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void fetchOverseerThread();
      void fetchOverseerPrompt();
    } else {
      setOverseerThread([]);
      setOverseerPrompt("");
      setOverseerPromptUpdatedAt(null);
      setReportPrompt("");
      setReportPromptUpdatedAt(null);
    }
    void fetchCoachPrompt();
    void fetchReportPrompt();
    void fetchAiLayers();
    void fetchModelSettings();
  }, [
    fetchCoachPrompt,
    fetchReportPrompt,
    fetchAiLayers,
    fetchModelSettings,
    fetchOverseerPrompt,
    fetchOverseerThread,
    isAdmin,
  ]);

  useEffect(() => {
    void fetchFeedbackList();
  }, [fetchFeedbackList]);

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

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      const transcript = text.trim();
      if (!transcript) {
        return;
      }

      const clientId = selectedClientId;
      if (!clientId) {
        setCoachInput((previous) => {
          if (!previous.trim()) {
            return transcript;
          }
          return `${previous.trimEnd()} ${transcript}`;
        });
        return;
      }

      if (!autoSendAfterTranscription) {
        setCoachInput((previous) => {
          if (!previous.trim()) {
            return transcript;
          }
          return `${previous.trimEnd()} ${transcript}`;
        });
        return;
      }

      if (coachPendingByClientId[clientId]) {
        queueTranscriptForClient(clientId, transcript);
        toast("Transcript in wachtrij geplaatst.");
        return;
      }

      void handleCoachSubmit(null, {
        clientId,
        message: transcript,
        clearInput: false,
        restoreInputOnError: false,
      });
    },
    [
      autoSendAfterTranscription,
      coachPendingByClientId,
      handleCoachSubmit,
      queueTranscriptForClient,
      selectedClientId,
    ]
  );

  const handleVoiceError = useCallback(
    (err: { message: string; requestId?: string }) => {
      const message =
        err.requestId && !err.message.includes("requestId:")
          ? `${err.message} (requestId: ${err.requestId})`
          : err.message;
      setError(message);
      toast.error(message);
    },
    []
  );

  async function handleCoachSubmit(
    event: React.FormEvent<HTMLFormElement> | null,
    options?: {
      clientId?: string | null;
      message?: string;
      clearInput?: boolean;
      restoreInputOnError?: boolean;
    }
  ) {
    event?.preventDefault();
    const clientId = options?.clientId ?? selectedClientId;
    const trimmedMessage = (options?.message ?? coachInput).trim();
    if (!clientId || !trimmedMessage) return;

    const shouldClearInput = options?.clearInput ?? true;
    const shouldRestoreInputOnError =
      options?.restoreInputOnError ?? shouldClearInput;
    const userTempId = `temp-user-${Date.now()}`;
    const assistantTempId = `${userTempId}-assistant`;
    const timestamp = new Date().toISOString();
    const requestId =
      typeof window !== "undefined" && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const conversationId = "default";
    const previousRequest = activeCoachRequestsRef.current[clientId];
    if (previousRequest) {
      previousRequest.controller.abort();
      removeCoachTempMessages(
        clientId,
        previousRequest.userTempId,
        previousRequest.assistantTempId
      );
    }
    const controller = new AbortController();
    activeCoachRequestsRef.current[clientId] = {
      requestId,
      controller,
      userTempId,
      assistantTempId,
    };

    if (shouldClearInput) {
      setCoachInput("");
    }
    setCoachPendingByClientId((prev) => ({
      ...prev,
      [clientId]: true,
    }));
    setCoachLastRequestIdByClientId((prev) => ({
      ...prev,
      [clientId]: requestId,
    }));
    setError(null);

    setClientHistories((prev) => {
      const prevHistory = prev[clientId] ?? [];
      return {
        ...prev,
        [clientId]: [
          ...prevHistory,
          {
            id: userTempId,
            role: "user",
            source: "HUMAN",
            content: trimmedMessage,
            createdAt: timestamp,
            meta: null,
          },
          {
            id: assistantTempId,
            role: "assistant",
            source: "AI",
            content: "",
            createdAt: timestamp,
            meta: { pending: true },
          },
        ],
      };
    });
    scrollToBottom(coachMessagesRef);

    let streamAccepted = false;
    const runBlockingFallback = async () => {
      const fallbackResponse = await fetch(`/api/coach/${clientId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-client-id": clientId,
          "x-conversation-id": conversationId,
        },
        body: JSON.stringify({
          message: trimmedMessage,
          conversationId,
        }),
        signal: controller.signal,
      });

      const fallbackRequestId =
        fallbackResponse.headers.get("x-request-id") ?? requestId;
      const fallbackData = await fallbackResponse.json().catch(() => ({}));
      if (!fallbackResponse.ok) {
        const fallbackError =
          typeof fallbackData.error === "string"
            ? fallbackData.error
            : "Coach kon niet reageren.";
        throw new Error(`${fallbackError} (requestId: ${fallbackRequestId})`);
      }

      setClientHistories((prev) => ({
        ...prev,
        [clientId]: fallbackData.history ?? [],
      }));
      scrollToBottom(coachMessagesRef);
    };

    try {
      let streamDone = false;

      const applyDeltaToAssistant = (delta: string) => {
        setClientHistories((prev) => {
          const prevHistory = prev[clientId] ?? [];
          return {
            ...prev,
            [clientId]: prevHistory.map((entry) => {
              if (entry.id !== assistantTempId) {
                return entry;
              }
              const isPlaceholder =
                entry.content === "De coach formuleert een antwoord...";
              return {
                ...entry,
                content: `${isPlaceholder ? "" : entry.content}${delta}`,
                meta: { ...(entry.meta ?? {}), pending: true },
              };
            }),
          };
        });
      };

      const clearAssistantPending = () => {
        setClientHistories((prev) => {
          const prevHistory = prev[clientId] ?? [];
          return {
            ...prev,
            [clientId]: prevHistory.map((entry) =>
              entry.id === assistantTempId
                ? { ...entry, meta: { ...(entry.meta ?? {}), pending: false } }
                : entry
            ),
          };
        });
      };

      const response = await fetch(`/api/coach/${clientId}/stream`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-client-id": clientId,
          "x-conversation-id": conversationId,
        },
        body: JSON.stringify({
          message: trimmedMessage,
          conversationId,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("STREAM_UNAVAILABLE");
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffered = "";
      let eventName = "message";
      let eventDataLines: string[] = [];

      const handleEvent = (name: string, rawData: string) => {
        if (!rawData) {
          return;
        }
        if (name === "meta") {
          const payload = JSON.parse(rawData) as {
            requestId?: unknown;
          };
          if (typeof payload.requestId === "string") {
            const streamRequestId = payload.requestId;
            setCoachLastRequestIdByClientId((prev) => ({
              ...prev,
              [clientId]: streamRequestId,
            }));
          }
          streamAccepted = true;
          return;
        }

        if (name === "delta") {
          const payload = JSON.parse(rawData) as {
            text?: unknown;
          };
          if (typeof payload.text === "string" && payload.text.length > 0) {
            applyDeltaToAssistant(payload.text);
            scrollToBottom(coachMessagesRef);
          }
          return;
        }

        if (name === "done") {
          streamDone = true;
          clearAssistantPending();
          return;
        }

        if (name === "error") {
          const payload = JSON.parse(rawData) as {
            error?: unknown;
            requestId?: unknown;
          };
          const errorMessage =
            typeof payload.error === "string"
              ? payload.error
              : "Coach kon niet reageren.";
          const errorRequestId =
            typeof payload.requestId === "string"
              ? payload.requestId
              : requestId;
          throw new Error(`${errorMessage} (requestId: ${errorRequestId})`);
        }
      };

      const flushEvent = () => {
        if (eventDataLines.length === 0) {
          eventName = "message";
          return;
        }
        const rawData = eventDataLines.join("\n");
        eventDataLines = [];
        const currentEvent = eventName;
        eventName = "message";
        handleEvent(currentEvent, rawData);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffered += decoder.decode();
          break;
        }
        buffered += decoder.decode(value, { stream: true });

        let lineBreakIndex = buffered.indexOf("\n");
        while (lineBreakIndex >= 0) {
          let line = buffered.slice(0, lineBreakIndex);
          buffered = buffered.slice(lineBreakIndex + 1);
          if (line.endsWith("\r")) {
            line = line.slice(0, -1);
          }

          if (line.length === 0) {
            flushEvent();
          } else if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            eventDataLines.push(line.slice(5).trimStart());
          }

          lineBreakIndex = buffered.indexOf("\n");
        }

        if (streamDone) {
          await reader.cancel();
          break;
        }
      }

      if (buffered.trim().length > 0) {
        if (buffered.startsWith("event:")) {
          const trailingLines = buffered.split(/\r?\n/);
          for (const line of trailingLines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              eventDataLines.push(line.slice(5).trimStart());
            }
          }
        }
        flushEvent();
      }

      if (!streamDone) {
        throw new Error("Stream onverwacht beëindigd.");
      }
    } catch (sendError) {
      const activeRequest = activeCoachRequestsRef.current[clientId];
      if (activeRequest?.requestId !== requestId) {
        return;
      }

      const isAbortError =
        sendError instanceof Error &&
        (sendError.name === "AbortError" || sendError.message === "Aborted");
      if (!isAbortError) {
        const shouldFallback =
          !streamAccepted &&
          sendError instanceof Error &&
          (sendError.message === "STREAM_UNAVAILABLE" ||
            sendError.name === "TypeError" ||
            sendError.name === "SyntaxError" ||
            sendError.message === "Stream onverwacht beëindigd.");
        if (shouldFallback) {
          try {
            await runBlockingFallback();
            toast.error(
              "Streaming niet beschikbaar, standaard antwoord gebruikt."
            );
            return;
          } catch (fallbackError) {
            console.error(fallbackError);
          }
        }

        console.error(sendError);
        removeCoachTempMessages(clientId, userTempId, assistantTempId);
        if (shouldRestoreInputOnError && selectedClientId === clientId) {
          setCoachInput(trimmedMessage);
        }

        const message =
          sendError instanceof Error
            ? sendError.message
            : "Contact met de coach is mislukt.";
        const errorWithRequestId = message.includes("requestId:")
          ? message
          : `${message} (requestId: ${requestId})`;
        setError(errorWithRequestId);
      }
    } finally {
      const activeRequest = activeCoachRequestsRef.current[clientId];
      if (activeRequest?.requestId !== requestId) {
        return;
      }
      delete activeCoachRequestsRef.current[clientId];
      clearCoachPendingState(clientId);

      const queuedTranscript = popQueuedTranscriptForClient(clientId);
      if (queuedTranscript && queuedTranscript.trim().length > 0) {
        void handleCoachSubmit(null, {
          clientId,
          message: queuedTranscript,
          clearInput: false,
          restoreInputOnError: false,
        });
      }
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

  async function handleReportPromptSave(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!reportPrompt.trim()) {
      setError("Prompt mag niet leeg zijn.");
      return;
    }

    setReportPromptSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/prompts/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: reportPrompt }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error ?? "Prompt opslaan is mislukt.");

      setReportPrompt(data.prompt ?? reportPrompt);
      setReportPromptUpdatedAt(data.updatedAt ?? null);
    } catch (saveError) {
      console.error(saveError);
      setError(
        (saveError as Error).message ?? "Rapportprompt opslaan is mislukt."
      );
    } finally {
      setReportPromptSaving(false);
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

  function openLayerDialogFor(layer?: AiResponseLayerRow | null) {
    if (layer) {
      setLayerForm({
        name: layer.name,
        description: layer.description,
        instructions: layer.instructions,
        target: layer.target,
        model: layer.model,
        temperature: layer.temperature ?? 0.2,
        isEnabled: layer.isEnabled,
      });
      setEditingLayer(layer);
    } else {
      setLayerForm(getDefaultLayerForm());
      setEditingLayer(null);
    }
    setLayerDialogOpen(true);
  }

  function closeLayerDialog() {
    setLayerDialogOpen(false);
    setEditingLayer(null);
    setLayerForm(getDefaultLayerForm());
  }

  async function handleLayerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !layerForm.name.trim() ||
      !layerForm.description.trim() ||
      !layerForm.instructions.trim() ||
      !layerForm.model
    ) {
      setError("Vul alle verplichte velden voor de AI-laag in.");
      return;
    }

    setLayerSaving(true);
    setError(null);
    try {
      const payload = {
        name: layerForm.name.trim(),
        description: layerForm.description.trim(),
        instructions: layerForm.instructions.trim(),
        target: layerForm.target,
        model: layerForm.model,
        temperature: Number(layerForm.temperature),
        isEnabled: layerForm.isEnabled,
      };
      const response = await fetch(
        editingLayer ? `/api/ai-layers/${editingLayer.id}` : "/api/ai-layers",
        {
          method: editingLayer ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Opslaan van AI-laag is mislukt.");
      }

      const updated = data.layer as AiResponseLayerRow;
      setAiLayers((prev) => {
        const next = editingLayer
          ? prev.map((item) => (item.id === updated.id ? updated : item))
          : [...prev, updated];
        return next.sort((a, b) =>
          a.position === b.position
            ? a.createdAt.localeCompare(b.createdAt)
            : a.position - b.position
        );
      });
      closeLayerDialog();
    } catch (saveError) {
      console.error(saveError);
      setError(
        (saveError as Error).message ?? "Opslaan van AI-laag is mislukt."
      );
    } finally {
      setLayerSaving(false);
    }
  }

  async function handleLayerToggle(layer: AiResponseLayerRow) {
    setLayerActionId(layer.id);
    setLayerActionType("toggle");
    setError(null);
    try {
      const response = await fetch(`/api/ai-layers/${layer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !layer.isEnabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Bijwerken van AI-laag is mislukt.");
      }
      const updated = data.layer as AiResponseLayerRow;
      setAiLayers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (updateError) {
      console.error(updateError);
      setError(
        (updateError as Error).message ?? "Bijwerken van AI-laag is mislukt."
      );
    } finally {
      setLayerActionId(null);
      setLayerActionType(null);
    }
  }

  async function handleLayerDelete(layerId: string) {
    setLayerActionId(layerId);
    setLayerActionType("delete");
    setError(null);
    try {
      const response = await fetch(`/api/ai-layers/${layerId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Verwijderen van AI-laag is mislukt.");
      }
      setAiLayers((prev) => prev.filter((item) => item.id !== layerId));
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        (deleteError as Error).message ?? "Verwijderen van AI-laag is mislukt."
      );
    } finally {
      setLayerActionId(null);
      setLayerActionType(null);
    }
  }

  async function handleOverseerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overseerInput.trim()) return;

    const requestId =
      typeof window !== "undefined" && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const trimmedMessage = overseerInput.trim();
    setOverseerLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/overseer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          message: trimmedMessage,
          clientId: selectedClientId ?? undefined,
        }),
      });
      const responseRequestId =
        response.headers.get("x-request-id") ?? requestId;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage =
          typeof data.error === "string"
            ? data.error
            : "Overseer (your coaching supervisor) kon niet reageren.";
        throw new Error(`${errorMessage} (requestId: ${responseRequestId})`);
      }
      setOverseerThread(data.thread ?? []);
      setOverseerInput("");
      scrollToBottom(overseerMessagesRef);
    } catch (sendError) {
      console.error(sendError);
      setError(
        (sendError as Error).message ?? "Contact met overseer is mislukt."
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

  async function handleDocumentDelete(documentId: string) {
    if (!selectedClientId || !documentId || deletingDocumentId === documentId) {
      return;
    }
    setDeletingDocumentId(documentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/clients/${selectedClientId}/documents/${documentId}`,
        {
          method: "DELETE",
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Document verwijderen is mislukt.");
      }
      setClientDocuments((prev) => ({
        ...prev,
        [selectedClientId]: Array.isArray(data.documents)
          ? data.documents
          : (prev[selectedClientId] ?? []).filter(
              (doc) => doc.id !== documentId
            ),
      }));
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        (deleteError as Error).message ?? "Document verwijderen is mislukt."
      );
    } finally {
      setDeletingDocumentId((current) =>
        current === documentId ? null : current
      );
    }
  }

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
    if (!selectedClientId || isReportLoading) {
      return;
    }
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
    if (typeof window === "undefined" || !report?.content) {
      return;
    }
    const blob = new Blob([report.content], {
      type: "text/plain;charset=utf-8",
    });
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

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOutUser();
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
          coachId: clientForm.coachId ? clientForm.coachId : null,
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
          coachId: newClientForm.coachId ? newClientForm.coachId : null,
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
        coachId: "",
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

  const renderClientDetailsContent = (variant: "desktop" | "mobile") => {
    const toggleClasses = [
      "inline-flex items-center rounded-full w-fit border mb-4 border-slate-200 bg-slate-50 p-1.5 text-xs font-medium text-slate-600",
      variant === "mobile" ? "mx-4 mt-4" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const bodyClasses =
      variant === "desktop"
        ? "space-y-4 z-20 overflow-y-auto max-h-[92vh] pb-8 px-4 lg:px-0"
        : "space-y-4 overflow-y-auto pb-8 px-4";

    return (
      <>
        <div className={toggleClasses}>
          <button
            onClick={() => setActiveChannel("coach")}
            className={`rounded-full z-20 px-4 py-1.5 transition ${
              activeChannel === "coach"
                ? "bg-white text-slate-900 shadow"
                : "hover:text-slate-900"
            }`}
          >
            Coach assistent
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveChannel("meta")}
              className={`rounded-full px-4 py-1.5 transition ${
                activeChannel === "meta"
                  ? "bg-white text-slate-900 shadow"
                  : "hover:text-slate-900"
              }`}
            >
              Overseer (privé)
            </button>
          )}
        </div>
        <div className={bodyClasses}>
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
            {isAdmin && selectedClient && (
              <Dialog
                open={isClientDialogOpen}
                onOpenChange={(open) => {
                  setClientDialogOpen(open);
                  if (!open) {
                    setAvatarFile(null);
                    setEditingClientId(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingClientId(selectedClient.id);
                      setAvatarFile(null);
                      setClientForm({
                        name: selectedClient.name,
                        focusArea: selectedClient.focusArea,
                        summary: selectedClient.summary,
                        goals: selectedClient.goals.join(", "),
                        avatarUrl: selectedClient.avatarUrl ?? "",
                        coachId: selectedClient.coachId ?? "",
                      });
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit2 className="size-3.5" />
                    Bewerk cliënt
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl space-y-4">
                  <DialogHeader>
                    <DialogTitle>Bewerk cliënt</DialogTitle>
                    <DialogDescription>
                      Werk gegevens bij voor {selectedClient.name}.
                    </DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleClientSave}>
                    <div className="flex items-center gap-3">
                      <div className="size-16 rounded-full border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center overflow-hidden">
                        {avatarFile ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={URL.createObjectURL(avatarFile)}
                              alt="Nieuwe avatar"
                              className="size-16 object-cover"
                            />
                          </>
                        ) : clientForm.avatarUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={clientForm.avatarUrl}
                              alt={clientForm.name}
                              className="size-16 object-cover"
                            />
                          </>
                        ) : selectedClientInitials ? (
                          <span className="text-sm font-semibold">
                            {selectedClientInitials}
                          </span>
                        ) : (
                          <UserRound className="size-5" />
                        )}
                      </div>
                      <div className="space-y-2 text-sm">
                        <input
                          id={editClientAvatarInputId}
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) =>
                            setAvatarFile(event.target.files?.[0] ?? null)
                          }
                        />
                        <label
                          htmlFor={editClientAvatarInputId}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Wijzig avatar
                        </label>
                        {clientForm.avatarUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setClientForm((form) => ({
                                ...form,
                                avatarUrl: "",
                              }));
                              setAvatarFile(null);
                            }}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Verwijder avatar
                          </button>
                        )}
                      </div>
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
                        className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
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
                        className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
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
                        className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
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
                        className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Toegewezen coach
                      <select
                        value={clientForm.coachId}
                        onChange={(event) =>
                          setClientForm((form) => ({
                            ...form,
                            coachId: event.target.value,
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-slate-900 focus:outline-none"
                        disabled={isCoachOptionsLoading}
                      >
                        <option value="">Nog niet toegewezen</option>
                        {coachOptions.map((coach) => (
                          <option key={coach.id} value={coach.id}>
                            {coach.name?.trim()
                              ? `${coach.name} (${coach.email})`
                              : coach.email}
                          </option>
                        ))}
                      </select>
                      {coachOptionsError ? (
                        <span className="text-xs text-rose-600">
                          {coachOptionsError}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Bepaal welke coach toegang heeft tot dit dossier.
                        </span>
                      )}
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
          </div>
          <div className="rounded-3xl bg-white p-4 space-y-0 flex items-center justify-center w-full">
            <label className="inline-flex items-center w-full gap-2 pl-1 text-[11px] text-slate-500">
              <Switch
                checked={autoSendAfterTranscription}
                onCheckedChange={setAutoSendAfterTranscription}
                disabled={!selectedClient}
                aria-label="Auto-send after transcription"
              />
              <span>Verzend na transcriptie</span>
            </label>
          </div>
          <div className="rounded-3xl bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Rapporten
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* <button
                  type="button"
                  onClick={handleRefreshReport}
                  disabled={!selectedClientId || isReportLoading}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {isReportLoading ? "Laden..." : "Ververs"}
                </button> */}
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={!selectedClientId || isReportGenerating}
                  className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isReportGenerating ? "Bezig..." : "Genereer"}
                </button>
              </div>
            </div>
            {reportError && (
              <p className="text-[12px] text-red-500">{reportError}</p>
            )}
            {clientReportList.length === 0 ? (
              <p className="text-[13px] text-slate-500">
                {isReportLoading
                  ? "Rapporten worden geladen..."
                  : "Nog geen rapporten beschikbaar."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {clientReportList.map((report) => {
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
                        onClick={() => handleOpenReport(report)}
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

          <div className="rounded-3xl bg-white p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Documenten
                </p>
                <p className="text-[11px] text-slate-500">
                  {documents.length > 0
                    ? `${documents.length} bestanden`
                    : "Geen bestanden"}
                </p>
              </div>

              <button
                type="button"
                onClick={handleAttachmentButtonClick}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
              >
                Upload
              </button>
            </div>

            {/* Empty state */}
            {documents.length === 0 ? (
              <p className="text-[13px] text-slate-500">
                Nog geen documenten geüpload.
              </p>
            ) : (
              /* File list */
              <ul className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between py-2"
                  >
                    {/* Left */}
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="size-3.5 min-w-3.5 text-primary" />
                      <p className="truncate text-[12px] text-slate-800">
                        {doc.originalName}
                      </p>
                    </div>

                    {/* Right */}
                    <div className="flex items-center gap-2 text-[11px]">
                      <a
                        href={doc.storedName}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-500 hover:text-slate-700"
                      >
                        Open
                      </a>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => handleDocumentDelete(doc.id)}
                        disabled={deletingDocumentId === doc.id}
                        className="text-rose-500 hover:text-rose-600 disabled:opacity-50"
                      >
                        {deletingDocumentId === doc.id
                          ? "Verwijderen..."
                          : "Verwijder"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
      </>
    );
  };

  return (
    <>
      <img
        alt="background"
        src="/talenttool-bg.png"
        className="absolute top-0 left-0 opacity-100 w-screen h-screen -z-1"
      />
      {/* {showMenuButton && (
        <button
          type="button"
          onClick={() => setMobileView("list")}
          className="lg:hidden fixed top-4 left-4 z-40 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Menu
        </button>
      )} */}
      {/* Used a very flat light grey background for the app container */}
      <div className="relative flex  h-screen max-h-screen w-full overflow-hidden text-slate-900">
        {/* Sidebar: Flat, bordered, minimal */}
        <aside
          className={[
            "pt-7 px-1.5 w-full lg:w-72 shrink-0 flex-col lg:flex lg:relative lg:shadow-none lg:bg-transparent bg-white",
            showSidebar ? "flex" : "hidden lg:flex",
            "h-full lg:h-auto overflow-y-auto lg:overflow-visible",
          ].join(" ")}
        >
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
                          coachId: "",
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
                        <label className="flex flex-col gap-1 text-sm">
                          Toegewezen coach
                          <select
                            value={newClientForm.coachId}
                            onChange={(event) =>
                              setNewClientForm((form) => ({
                                ...form,
                                coachId: event.target.value,
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-slate-900 focus:outline-none"
                            disabled={isCoachOptionsLoading}
                          >
                            <option value="">Nog niet toegewezen</option>
                            {coachOptions.map((coach) => (
                              <option key={coach.id} value={coach.id}>
                                {coach.name?.trim()
                                  ? `${coach.name} (${coach.email})`
                                  : coach.email}
                              </option>
                            ))}
                          </select>
                          {coachOptionsError ? (
                            <span className="text-xs text-rose-600">
                              {coachOptionsError}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">
                              {coachOptions.length === 0
                                ? "Nodig coaches uit om cliënten toe te wijzen."
                                : "Deze coach krijgt toegang tot dit dossier."}
                            </span>
                          )}
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
                          if (isMobile) {
                            setMobileView("chat");
                          }
                        }}
                        className={[
                          "group w-full flex items-center gap-3 border border-transparent rounded-lg px-2 py-2 text-left transition",
                          "hover:bg-white/40 hover:border-white/40",
                          isActive
                            ? "bg-white/40 border-white/50 text-[#242424]"
                            : "text-[#242424]",
                        ].join(" ")}
                      >
                        <div className="size-7 rounded-full overflow-hidden bg-white ring-1 ring-slate-200/70 flex items-center justify-center">
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
                            <UserRound className="size-4 text-black" />
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
                      onClick={() => {
                        setActiveSidebarTab("user-management");
                        if (isMobile) {
                          setMobileView("chat");
                        }
                      }}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                        activeSidebarTab === "user-management"
                          ? "bg-slate-900/10 text-slate-900"
                          : "text-slate-900 hover:bg-slate-100/70",
                      ].join(" ")}
                    >
                      <ShieldCheck className="size-4 text-slate-900" />
                      Gebruikersbeheer
                    </button>
                  </li>
                )}
                {isAdmin && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSidebarTab("prompt-center");
                        if (isMobile) {
                          setMobileView("chat");
                        }
                      }}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                        activeSidebarTab === "prompt-center"
                          ? ""
                          : "text-slate-900 hover:bg-slate-100/70",
                      ].join(" ")}
                    >
                      <Sparkles className="size-4 text-slate-900" />
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
                            <button className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100/70">
                              <Icon className="size-4 text-slate-900" />
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
        <main
          className={[
            "flex flex-1 min-h-0 flex-col min-w-0 overflow-hidden",
            showMainContent ? "flex" : "hidden lg:flex",
          ].join(" ")}
        >
          {activeSidebarTab === "prompt-center" ? (
            <div className="p-4 h-full">
              <div className="flex h-full rounded-3xl flex-col pt-4 bg-white">
                <header className="relative z-10 flex rounded-t-3xl py-3 shrink-0 items-center justify-between border-b border-white/30 px-8 backdrop-blur-xl">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Administratie
                    </p>
                    <h1 className="text-lg font-semibold text-slate-900">
                      Prompthistorie &amp; Feedback
                    </h1>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6">
                  <div className="flex flex-col gap-4">
                    <div className="rounded-2xl bg-[#f1f1f1] p-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
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
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
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
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
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
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2 bg-[#f1f1f1] p-4 rounded-3xl">
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
                          <div className="flex flex-col gap-1">
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
                                onClick={() =>
                                  handlePromptRegenerate("OVERSEER")
                                }
                                disabled={
                                  isRefiningPrompt &&
                                  refineTarget === "OVERSEER"
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
                              {isOverseerPromptSaving
                                ? "Opslaan..."
                                : "Opslaan"}
                            </button>
                          </div>
                        </form>
                      )}
                      {isReportPromptLoading ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                          Rapportprompt wordt geladen...
                        </div>
                      ) : (
                        <form
                          onSubmit={handleReportPromptSave}
                          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  Rapportgenerator prompt
                                </p>
                                <p className="text-xs text-slate-500">
                                  Laatste update:{" "}
                                  {reportPromptUpdatedAt
                                    ? new Date(
                                        reportPromptUpdatedAt
                                      ).toLocaleString()
                                    : "Onbekend"}
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-slate-500">
                              Bepaalt hoe automatische cliëntrapporten worden
                              opgebouwd.
                            </p>
                          </div>
                          <textarea
                            value={reportPrompt}
                            onChange={(event) =>
                              setReportPrompt(event.target.value)
                            }
                            className="min-h-[250px] w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-400 focus:outline-none"
                          />
                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={isReportPromptSaving}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {isReportPromptSaving ? "Opslaan..." : "Opslaan"}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    <div className="rounded-2xl bg-[#f1f1f1] p-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <ShieldCheck className="size-4 text-emerald-500" />
                              <span>AI-lagen</span>
                            </p>
                            <p className="text-xs text-slate-500">
                              Laat antwoorden extra controles doorlopen voordat
                              ze naar de coach gaan.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openLayerDialogFor(null)}
                            disabled={availableModels.length === 0}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Plus className="size-3.5" />
                            <span>Nieuwe laag</span>
                          </button>
                        </div>
                        {isLayerLoading ? (
                          <p className="text-sm text-slate-500">
                            AI-lagen worden geladen...
                          </p>
                        ) : aiLayers.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                            Nog geen AI-lagen ingesteld. Voeg een laag toe om
                            schrijfstijl, feitelijke juistheid of andere
                            voorwaarden af te dwingen.
                          </div>
                        ) : (
                          <ul className="space-y-3">
                            {aiLayers.map((layer) => (
                              <li
                                key={layer.id}
                                className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-900">
                                        {layer.name}
                                      </p>
                                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                        {layerTargetLabels[layer.target]}
                                      </span>
                                      <span
                                        className={[
                                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                          layer.isEnabled
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-slate-200 text-slate-600",
                                        ].join(" ")}
                                      >
                                        {layer.isEnabled ? "Actief" : "Uit"}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                      Model:{" "}
                                      <span className="font-medium">
                                        {getModelLabel(layer.model)}
                                      </span>{" "}
                                      • Temperatuur:{" "}
                                      {layer.temperature.toFixed(1)}
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openLayerDialogFor(layer)}
                                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                                    >
                                      Bewerken
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleLayerDelete(layer.id)
                                      }
                                      disabled={
                                        layerActionId === layer.id &&
                                        layerActionType === "delete"
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-50"
                                    >
                                      <Trash2 className="size-3.5" />
                                      {layerActionId === layer.id &&
                                      layerActionType === "delete"
                                        ? "Verwijderen..."
                                        : "Verwijderen"}
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-3 space-y-1">
                                  <p className="text-[11px] font-semibold uppercase text-slate-400">
                                    Doel
                                  </p>
                                  <p className="text-sm text-slate-700">
                                    {layer.description}
                                  </p>
                                </div>
                                <div className="mt-3 space-y-1">
                                  <p className="text-[11px] font-semibold uppercase text-slate-400">
                                    Instructies
                                  </p>
                                  <p className="text-sm text-slate-800 whitespace-pre-line">
                                    {layer.instructions}
                                  </p>
                                </div>
                                <div className="mt-3">
                                  <button
                                    type="button"
                                    onClick={() => handleLayerToggle(layer)}
                                    disabled={
                                      layerActionId === layer.id &&
                                      layerActionType === "toggle"
                                    }
                                    className={[
                                      "rounded-lg px-3 py-1.5 text-xs font-semibold",
                                      layer.isEnabled
                                        ? "border border-amber-200 text-amber-700 hover:bg-amber-50"
                                        : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                                      layerActionId === layer.id &&
                                      layerActionType === "toggle"
                                        ? "opacity-50"
                                        : "",
                                    ].join(" ")}
                                  >
                                    {layerActionId === layer.id &&
                                    layerActionType === "toggle"
                                      ? "Bijwerken..."
                                      : layer.isEnabled
                                      ? "Uitschakelen"
                                      : "Inschakelen"}
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2 bg-[#f1f1f1] p-4 rounded-3xl">
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
            </div>
          ) : activeSidebarTab === "user-management" ? (
            <AdminUserManagement
              onBack={() => setActiveSidebarTab("dashboard")}
            />
          ) : (
            <>
              <div className="relative flex-1 min-h-0 overflow-hidden p-0 md:p-2">
                <div
                  className="
                    relative flex h-full min-h-0 gap-4
                    rounded-0
                    md:rounded-[36px]
                    overflow-hidden
                    bg-white/25
                    backdrop-blur-2xl backdrop-saturate-120
                    p-0 md:p-4
                    py-0!
                    text-sm text-slate-800
                  "
                >
                  {/* Border */}
                  <div className="pointer-events-none absolute inset-0 rounded-[36px] border border-white z-10" />

                  {/* Top highlight */}
                  <div className="pointer-events-none absolute inset-0 rounded-[36px] bg-gradient-to-b from-white/45 via-white/18 to-transparent z-10" />

                  {/* Actual content */}
                  <section className="flex flex-1 relative z-20 min-h-0 flex-col rounded-2xl pb-0 min-w-full lg:min-w-0">
                    <div className="flex min-h-0 flex-1 flex-col">
                      {isMobileDashboardChat && (
                        <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setMobileView("list")}
                            className="inline-flex items-center gap-1 rounded-full text-xs font-semibold text-slate-600"
                          >
                            <ArrowLeft className="size-4" />
                          </button>
                          <div className="flex flex-1 items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white overflow-hidden">
                              {selectedClient?.avatarUrl ? (
                                <Image
                                  src={selectedClient.avatarUrl}
                                  alt={selectedClient?.name ?? "Cliënt"}
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
                                {selectedClient?.name ?? "Selecteer een cliënt"}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {selectedClient?.focusArea || "Geen focus"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (isMobile) {
                                setMobileView("details");
                              }
                            }}
                            disabled={!selectedClient}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 lg:hidden"
                          >
                            Cliëntdetails
                          </button>
                        </div>
                      )}
                      {activeChannel === "coach" ? (
                        <>
                          <div
                            ref={coachMessagesRef}
                            className="flex-1 space-y-3 flex flex-col overflow-y-auto px-3 lg:px-5 pb-5 lg:py-5"
                          >
                            {messages.length === 0 ? (
                              <div className="flex h-fit w-fit py-2 pl-5 pr-7 mt-4 bg-white items-center justify-center gap-2 rounded-3xl m-auto">
                                <MessageSquare className="size-3.5" />
                                <p>Start een gesprek met je cliënt.</p>
                              </div>
                            ) : (
                              messages.map((message) => {
                                const isAi =
                                  message.role === "assistant" ||
                                  message.role === "system";
                                const isPendingResponse =
                                  isAi && isPendingAgentMessage(message);
                                const senderName = isAi
                                  ? "AI-coach"
                                  : displayUser.name ?? "Jij";
                                const avatarNode = isAi ? (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#222222] text-white">
                                    <Sparkles className="size-4" />
                                  </div>
                                ) : (
                                  renderUserAvatarElement(
                                    displayUser.name,
                                    displayUser.image
                                  )
                                );
                                return (
                                  <div
                                    key={message.id}
                                    className={`flex ${
                                      isAi ? "justify-start" : "justify-end"
                                    }`}
                                  >
                                    <div
                                      className={`flex max-w-[86%] lg:max-w-[75%] items-start gap-3 ${
                                        isAi ? "" : "flex-row-reverse"
                                      }`}
                                    >
                                      <div className="mt-1 shrink-0">
                                        {avatarNode}
                                      </div>
                                      <div
                                        className={`flex-1 rounded-3xl leading-relaxed ${
                                          isAi
                                            ? "bg-white rounded-tl-md p-5 text-slate-900"
                                            : "bg-white rounded-tr-md p-4 text-slate-900"
                                        }`}
                                      >
                                        <p
                                          className={`text-[11px] font-semibold uppercase tracking-wide ${
                                            isAi
                                              ? "text-[#222222]"
                                              : "text-slate-900"
                                          }`}
                                        >
                                          {senderName}
                                        </p>
                                        <p className="mt-1 whitespace-pre-wrap">
                                          {cleanMessageContent(message.content)}
                                        </p>
                                        {isPendingResponse && (
                                          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                                            <Loader2 className="size-3 animate-spin" />
                                            Antwoord wordt gevormd...
                                          </div>
                                        )}
                                        {isAdmin &&
                                          message.role === "assistant" &&
                                          isAi && (
                                            <div className="mt-2 text-[11px]">
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
                                                Geef feedback op AI
                                              </button>
                                            </div>
                                          )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          {process.env.NODE_ENV !== "production" && (
                            <div className="px-3 md:px-4 pb-2 text-[11px] text-slate-500">
                              <p className="font-semibold text-slate-600">
                                Debug chat requests
                              </p>
                              <div className="mt-1 space-y-1">
                                {clientList.map((client) => (
                                  <p key={`debug-${client.id}`}>
                                    {client.name}: pending=
                                    {coachPendingByClientId[client.id]
                                      ? "yes"
                                      : "no"}
                                    , requestId=
                                    {coachLastRequestIdByClientId[client.id] ??
                                      "-"}
                                    , queued=
                                    {queuedTranscriptByClientId[client.id]
                                      ? "yes"
                                      : "no"}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          <form
                            onSubmit={handleCoachSubmit}
                            className="px-3 md:px-4 pb-4"
                          >
                            <div className="rounded-3xl relative bg-[#FFFF] border">
                              <textarea
                                value={coachInput}
                                onChange={(event) =>
                                  setCoachInput(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" || event.shiftKey) {
                                    return;
                                  }
                                  if (
                                    (event.nativeEvent as KeyboardEvent)
                                      .isComposing
                                  ) {
                                    return;
                                  }
                                  if (
                                    !selectedClientId ||
                                    isSelectedClientCoachPending ||
                                    !coachInput.trim().length
                                  ) {
                                    return;
                                  }
                                  event.preventDefault();
                                  event.currentTarget.form?.requestSubmit();
                                }}
                                placeholder="Schrijf een bericht..."
                                className="h-30 w-full resize-none rounded-lg border border-transparent p-3 text-sm text-slate-900 focus:outline-none"
                                rows={3}
                              />
                              <div className="mt-2 flex items-center justify-between text-xs">
                                {/* <button
                                  type="button"
                                  onClick={handleAttachmentButtonClick}
                                  className="inline-flex items-center gap-1 absolute bottom-2 mr-2 bg-white aspect-square right-12 rounded-full border border-slate-200 px-3 text-slate-600"
                                >
                                  <Paperclip className="size-3.5" />
                                </button> */}
                                <button
                                  type="submit"
                                  disabled={
                                    !selectedClient ||
                                    isSelectedClientCoachPending
                                  }
                                  className="inline-flex items-center gap-2  aspect-square rounded-full bg-slate-900 px-3 absolute bottom-2 right-2 text-white disabled:opacity-50"
                                >
                                  <ArrowUp className="size-4" />
                                </button>
                                <VoiceRecorder
                                  disabled={
                                    !selectedClient ||
                                    isSelectedClientCoachPending
                                  }
                                  languageHint="nl"
                                  onTranscript={handleVoiceTranscript}
                                  onError={handleVoiceError}
                                />
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
                                Overseer (your coaching supervisor) is privé
                                voor jouw account. Vraag naar trends en
                                signalen.
                              </div>
                            ) : (
                              overseerThread.map((message) => {
                                const isAssistant =
                                  message.role === "assistant";
                                const context =
                                  message.meta &&
                                  typeof message.meta === "object" &&
                                  "context" in message.meta &&
                                  typeof (
                                    message.meta as {
                                      context?: unknown;
                                    }
                                  ).context === "object" &&
                                  (message.meta as { context?: unknown })
                                    .context !== null
                                    ? (
                                        message.meta as {
                                          context?: {
                                            clientId?: unknown;
                                          };
                                        }
                                      ).context ?? null
                                    : null;
                                const contextClientId =
                                  context &&
                                  typeof context.clientId === "string"
                                    ? context.clientId
                                    : null;
                                const contextClientName = contextClientId
                                  ? clientNameById[contextClientId] ??
                                    contextClientId
                                  : null;
                                const senderName = isAssistant
                                  ? "Overseer (your coaching supervisor)"
                                  : displayUser.name ?? "Jij";
                                const avatarNode = isAssistant ? (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 text-purple-600">
                                    <Sparkles className="size-4" />
                                  </div>
                                ) : (
                                  renderUserAvatarElement(
                                    displayUser.name,
                                    displayUser.image
                                  )
                                );
                                return (
                                  <div
                                    key={message.id}
                                    className={`flex ${
                                      isAssistant
                                        ? "justify-start"
                                        : "justify-end"
                                    }`}
                                  >
                                    <div
                                      className={`flex max-w-[90%] items-start gap-3 ${
                                        isAssistant ? "" : "flex-row-reverse"
                                      }`}
                                    >
                                      <div className="mt-1 shrink-0">
                                        {avatarNode}
                                      </div>
                                      <div
                                        className={`flex-1 rounded-xl border px-4 py-3 ${
                                          isAssistant
                                            ? "border-purple-200 bg-white"
                                            : "border-slate-200 bg-slate-50"
                                        }`}
                                      >
                                        <p
                                          className={`text-[10px] font-semibold uppercase tracking-wide ${
                                            isAssistant
                                              ? "text-purple-600"
                                              : "text-slate-500"
                                          }`}
                                        >
                                          {senderName}
                                        </p>
                                        {contextClientName && (
                                          <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                            Client: {contextClientName}
                                          </p>
                                        )}
                                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                                          {cleanMessageContent(message.content)}
                                        </p>
                                        {isAdmin && isAssistant && (
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
                                    </div>
                                  </div>
                                );
                              })
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
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" || event.shiftKey) {
                                    return;
                                  }
                                  if (
                                    (event.nativeEvent as KeyboardEvent)
                                      .isComposing
                                  ) {
                                    return;
                                  }
                                  if (
                                    isOverseerLoading ||
                                    !overseerInput.trim().length
                                  ) {
                                    return;
                                  }
                                  event.preventDefault();
                                  event.currentTarget.form?.requestSubmit();
                                }}
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
                  <aside className="hidden lg:flex min-h-0 w-84 shrink-0 pt-4 flex-col text-sm text-slate-700">
                    {renderClientDetailsContent("desktop")}
                  </aside>
                </div>
              </div>
            </>
          )}
        </main>
        {isMobileDetailsView && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setMobileView("chat")}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                <ArrowLeft className="size-4" />
                Terug
              </button>
              <div className="text-center min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  Cliëntdetails
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {selectedClient?.name ?? "Selecteer een cliënt"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className="text-xs font-semibold text-slate-600"
              >
                Cliënten
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderClientDetailsContent("mobile")}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={layerDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeLayerDialog();
          }
        }}
      >
        <DialogContent className="max-w-3xl space-y-4">
          <DialogHeader>
            <DialogTitle>
              {editingLayer ? "AI-laag bewerken" : "Nieuwe AI-laag"}
            </DialogTitle>
            <DialogDescription>
              Ontwerp een extra controlemoment voordat antwoorden zichtbaar
              worden. Elke laag voert een extra modelaanroep uit.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLayerSubmit} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Naam
                <input
                  type="text"
                  value={layerForm.name}
                  onChange={(event) =>
                    setLayerForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Doelgroep
                <select
                  value={layerForm.target}
                  onChange={(event) =>
                    setLayerForm((prev) => ({
                      ...prev,
                      target: event.target.value as AiLayerTarget,
                    }))
                  }
                  className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                >
                  <option value="COACH">Coachkanaal</option>
                  <option value="OVERSEER">Overzichtscoach</option>
                  <option value="ALL">Beide agenten</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Doel van de laag
              <textarea
                value={layerForm.description}
                onChange={(event) =>
                  setLayerForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                className="min-h-[80px] rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                placeholder="Bijv. controleer schrijfstijl of voeg waarschuwingen toe bij onzekerheden."
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Instructies voor het model
              <textarea
                value={layerForm.instructions}
                onChange={(event) =>
                  setLayerForm((prev) => ({
                    ...prev,
                    instructions: event.target.value,
                  }))
                }
                className="min-h-[160px] rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                placeholder="Beschrijf precies hoe deze laag het conceptantwoord moet controleren of herschrijven."
                required
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                Model
                <select
                  value={layerForm.model}
                  onChange={(event) =>
                    setLayerForm((prev) => ({
                      ...prev,
                      model: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
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
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Temperatuur
                <input
                  type="number"
                  min={0}
                  max={1.2}
                  step={0.1}
                  value={layerForm.temperature}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setLayerForm((prev) => ({
                      ...prev,
                      temperature: Number.isNaN(next) ? prev.temperature : next,
                    }));
                  }}
                  className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={layerForm.isEnabled}
                onChange={(event) =>
                  setLayerForm((prev) => ({
                    ...prev,
                    isEnabled: event.target.checked,
                  }))
                }
                className="size-4"
              />
              Laag is actief
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              Elke extra laag voegt een extra modelaanroep toe en kan het
              antwoord iets vertragen. Gebruik korte instructies voor soepele
              prestaties.
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeLayerDialog}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={isLayerSaving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isLayerSaving
                  ? "Opslaan..."
                  : editingLayer
                  ? "Wijzigingen opslaan"
                  : "Laag toevoegen"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
