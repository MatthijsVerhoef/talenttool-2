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

import { ArrowLeft } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { toast } from "sonner";

import { signOutUser } from "@/lib/auth-client";
import { AdminUserManagement } from "@/components/admin/user-management";
import { ReportPanel } from "@/components/reports/report-panel";
import {
  PromptCenterPanel,
  type AgentFeedbackItem,
  type AgentKindType,
  type AiLayerTarget,
  type AiResponseLayerRow,
  type ModelOption,
} from "@/components/admin/prompt-center-panel";
import { LayerDialog } from "@/components/admin/layer-dialog";
import {
  FeedbackDialog,
  type FeedbackTarget,
} from "@/components/coach/feedback-dialog";
import { ClientDetailsPanel } from "@/components/coach/client-details-panel";
import { OverseerPanel } from "@/components/overseer/overseer-panel";
import { CoachChatPanel } from "@/components/chat/coach-chat-panel";
import { MobileChatHeader } from "@/components/chat/mobile-chat-header";
import {
  DashboardSidebar,
  type ActiveSidebarTab,
  type NewClientForm,
  type SettingsTab,
} from "@/components/clients/dashboard-sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

import type { ClientProfile } from "@/lib/data/clients";
import type { ClientDocument } from "@/lib/data/documents";
import type { AgentMessage } from "@/lib/data/sessions";
import { useIsMobile } from "@/hooks/use-mobile";
import { joinUserName, splitUserName } from "@/lib/user-name";

interface CoachDashboardProps {
  clients: ClientProfile[];
  currentUser: {
    name: string;
    email: string;
    image?: string | null;
    companyName?: string | null;
    companyLogoUrl?: string | null;
    role: UserRole;
  };
}

type HistoryState = Record<string, AgentMessage[]>;
type DocumentState = Record<string, ClientDocument[]>;
type ClientPendingState = Record<string, boolean>;
type ClientRequestState = Record<string, string | null>;
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

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return record;
  }

  const next = { ...record };
  delete next[key];
  return next;
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
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2ea3f2] text-white">
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

async function clearClientStateAfterSignOut() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.clear();
  } catch {}

  try {
    window.sessionStorage.clear();
  } catch {}

  if (typeof caches !== "undefined") {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
}


export function CoachDashboard({ clients, currentUser }: CoachDashboardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const initialUserName = splitUserName(currentUser.name);
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
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
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
    managerName: "",
    focusArea: "",
    summary: "",
    goals: "",
    avatarUrl: "",
    coachId: "",
  });
  const [newClientForm, setNewClientForm] = useState({
    name: "",
    managerName: "",
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
    firstName: initialUserName.firstName,
    lastName: initialUserName.lastName,
    image: currentUser.image ?? "",
    companyName: currentUser.companyName ?? "",
    companyLogoUrl: currentUser.companyLogoUrl ?? "",
  });
  const [userAvatarFile, setUserAvatarFile] = useState<File | null>(null);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
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
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isFeedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState<AgentFeedbackItem[]>([]);
  const [isFeedbackLoading, setFeedbackLoading] = useState(false);
  const [refineTarget, setRefineTarget] = useState<AgentKindType | null>(null);
  const [isRefiningPrompt, setRefiningPrompt] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] =
    useState<ActiveSidebarTab>("dashboard");
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
  const companyLogoInputId = useId();
  const activeCoachRequestsRef = useRef<Record<string, ActiveCoachRequest>>({});
  const queuedTranscriptByClientIdRef = useRef<Record<string, string>>({});
  const normalizedUserRole =
    typeof displayUser.role === "string"
      ? displayUser.role.trim().toUpperCase()
      : "";
  const isAdmin = normalizedUserRole === "ADMIN";
  const canEditClients = isAdmin || normalizedUserRole === "COACH";
  const canUseSupervisorChannel =
    normalizedUserRole === "ADMIN" || normalizedUserRole === "COACH";
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
    const nextUserName = splitUserName(currentUser.name);
    setUserForm({
      firstName: nextUserName.firstName,
      lastName: nextUserName.lastName,
      image: currentUser.image ?? "",
      companyName: currentUser.companyName ?? "",
      companyLogoUrl: currentUser.companyLogoUrl ?? "",
    });
    setCompanyLogoFile(null);
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
    if (!canUseSupervisorChannel && activeChannel === "meta") {
      setActiveChannel("coach");
    }
  }, [canUseSupervisorChannel, activeChannel]);

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
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [summaryCanExpand, setSummaryCanExpand] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement | null>(null);

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
    if (!selectedClientId) {
      return;
    }
    const docs = selectedClientDocs ?? [];
    const hasPendingExtraction = docs.some(
      (document) => document.extractionStatus === "PENDING"
    );
    if (!hasPendingExtraction) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchClientDocuments(selectedClientId);
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedClientId, selectedClientDocs]);

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
      managerName: selectedClient.managerName ?? "",
      focusArea: selectedClient.focusArea,
      summary: selectedClient.summary,
      goals: selectedClient.goals.join(", "),
      avatarUrl: selectedClient.avatarUrl ?? "",
      coachId: selectedClient.coachId ?? "",
    });
    setAvatarFile(null);
  }, [selectedClient, isClientDialogOpen]);

  useEffect(() => {
    const nextUserName = splitUserName(displayUser.name);
    setUserForm({
      firstName: nextUserName.firstName,
      lastName: nextUserName.lastName,
      image: displayUser.image ?? "",
      companyName: displayUser.companyName ?? "",
      companyLogoUrl: displayUser.companyLogoUrl ?? "",
    });
    setUserAvatarFile(null);
    setCompanyLogoFile(null);
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
    if (!canUseSupervisorChannel) {
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
  }, [canUseSupervisorChannel]);

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
    if (canUseSupervisorChannel) {
      void fetchOverseerThread();
    } else {
      setOverseerThread([]);
    }

    if (isAdmin) {
      void fetchOverseerPrompt();
    } else {
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
    canUseSupervisorChannel,
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

      const finalizeStreamMessages = (
        persistedUserMessageId?: string,
        persistedAssistantMessageId?: string
      ) => {
        setClientHistories((prev) => {
          const prevHistory = prev[clientId] ?? [];
          return {
            ...prev,
            [clientId]: prevHistory.map((entry) => {
              if (entry.id === userTempId) {
                return {
                  ...entry,
                  id: persistedUserMessageId ?? entry.id,
                };
              }
              if (entry.id === assistantTempId) {
                return {
                  ...entry,
                  id: persistedAssistantMessageId ?? entry.id,
                  meta: { ...(entry.meta ?? {}), pending: false },
                };
              }
              return entry;
            }),
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
          const payload = JSON.parse(rawData) as {
            userMessageId?: unknown;
            assistantMessageId?: unknown;
          };
          streamDone = true;
          finalizeStreamMessages(
            typeof payload.userMessageId === "string"
              ? payload.userMessageId
              : undefined,
            typeof payload.assistantMessageId === "string"
              ? payload.assistantMessageId
              : undefined
          );
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
            : "Overzichtscoach (your coaching supervisor) kon niet reageren.";
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
    const clientId = selectedClientId;

    setDocUploading(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("file", file);

      const response = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        body: payload,
      });
      if (!response.ok) throw new Error("Uploaden is mislukt.");

      const data = await response.json();
      setClientDocuments((prev) => ({
        ...prev,
        [clientId]: data.documents ?? [],
      }));

      const latestUploaded = Array.isArray(data.documents)
        ? data.documents[0]
        : null;
      if (latestUploaded?.extractionStatus === "FAILED") {
        toast.error(
          "Bestand is geüpload, maar tekstextractie is mislukt. Probeer herverwerken."
        );
      } else if (latestUploaded?.extractionStatus === "PENDING") {
        toast("Bestand geüpload. Verwerking loopt nog.");
      } else {
        toast.success("Bestand geüpload.");
      }
    } catch (uploadError) {
      console.error(uploadError);
      setError((uploadError as Error).message ?? "Uploaden is niet gelukt.");
      void fetchClientDocuments(clientId);
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
      await clearClientStateAfterSignOut();
      window.location.replace("/login");
      return;
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
          managerName: clientForm.managerName,
          focusArea: clientForm.focusArea,
          summary: clientForm.summary,
          goals: clientForm.goals
            .split(",")
            .map((goal) => goal.trim())
            .filter(Boolean),
          ...(isAdmin
            ? {
                coachId: clientForm.coachId ? clientForm.coachId : null,
              }
            : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Bijwerken van Coachee is mislukt.");
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
        (updateError as Error).message ?? "Bijwerken van Coachee is mislukt."
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
          managerName: newClientForm.managerName,
          focusArea: newClientForm.focusArea,
          summary: newClientForm.summary,
          goals: newClientForm.goals
            .split(",")
            .map((goal) => goal.trim())
            .filter((goal) => goal.length > 0),
          ...(avatarUrl ? { avatarUrl } : {}),
          ...(isAdmin
            ? {
                coachId: newClientForm.coachId ? newClientForm.coachId : null,
              }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Coachee aanmaken is mislukt.");
      }

      router.refresh();
      if (data.client?.id) {
        setClientList((prev) => [...prev, data.client]);
        setSelectedClientId(data.client.id);
      }
      setCreateClientDialogOpen(false);
      setNewClientForm({
        name: "",
        managerName: "",
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
          : "Coachee aanmaken is mislukt."
      );
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleClientDelete(clientId: string) {
    const client = clientList.find((entry) => entry.id === clientId);
    if (!client || deletingClientId === clientId) {
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je ${client.name} wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingClientId(clientId);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Coachee verwijderen is mislukt.");
      }

      const activeRequest = activeCoachRequestsRef.current[clientId];
      if (activeRequest) {
        activeRequest.controller.abort();
        delete activeCoachRequestsRef.current[clientId];
      }

      delete queuedTranscriptByClientIdRef.current[clientId];

      const nextSelectedClientId =
        selectedClientId === clientId
          ? clientList.find((entry) => entry.id !== clientId)?.id ?? null
          : selectedClientId;

      setClientList((prev) => prev.filter((entry) => entry.id !== clientId));
      setSelectedClientId(nextSelectedClientId);
      setClientHistories((prev) => removeRecordKey(prev, clientId));
      setClientDocuments((prev) => removeRecordKey(prev, clientId));
      setClientReports((prev) => removeRecordKey(prev, clientId));
      setCoachPendingByClientId((prev) => removeRecordKey(prev, clientId));
      setCoachLastRequestIdByClientId((prev) =>
        removeRecordKey(prev, clientId)
      );
      setQueuedTranscriptByClientId((prev) => removeRecordKey(prev, clientId));
      setClientDialogOpen(false);
      setEditingClientId(null);
      setAvatarFile(null);
      toast.success("Coachee verwijderd.");
      router.refresh();
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Coachee verwijderen is mislukt."
      );
    } finally {
      setDeletingClientId((current) => (current === clientId ? null : current));
    }
  }

  async function handleUserSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserSaving(true);
    setError(null);
    try {
      if (!isAdmin && !userForm.companyName.trim()) {
        throw new Error("Bedrijfsnaam is verplicht.");
      }

      let imageUrl = userForm.image;
      let companyLogoUrl = userForm.companyLogoUrl;
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

      if (companyLogoFile) {
        const companyLogoForm = new FormData();
        companyLogoForm.append("file", companyLogoFile);
        const uploadResponse = await fetch(`/api/uploads/avatar`, {
          method: "POST",
          body: companyLogoForm,
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.url) {
          throw new Error(
            uploadData.error ?? "Bedrijfslogo uploaden is mislukt."
          );
        }
        companyLogoUrl = uploadData.url as string;
      }

      const response = await fetch(`/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          companyName: userForm.companyName,
          companyLogoUrl,
          image: imageUrl,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Profiel bijwerken is mislukt.");
      }

      const updatedName =
        typeof data.user?.name === "string" && data.user.name.trim().length > 0
          ? data.user.name
          : joinUserName(userForm.firstName, userForm.lastName);
      const updatedNameParts = splitUserName(updatedName);

      setDisplayUser((prev) => ({
        ...prev,
        name: updatedName,
        image: imageUrl,
        companyName: userForm.companyName.trim(),
        companyLogoUrl,
      }));
      setUserForm((prev) => ({
        ...prev,
        firstName: updatedNameParts.firstName,
        lastName: updatedNameParts.lastName,
        image: imageUrl,
        companyName: userForm.companyName.trim(),
        companyLogoUrl,
      }));
      setUserAvatarFile(null);
      setCompanyLogoFile(null);
      router.refresh();
    } catch (userError) {
      console.error(userError);
      setError((userError as Error).message ?? "Profiel bijwerken is mislukt.");
    } finally {
      setUserSaving(false);
    }
  }

  function openFeedbackDialog(agentType: AgentKindType, message: AgentMessage) {
    if (message.id.startsWith("temp-")) {
      setError("Wacht tot het antwoord volledig is opgeslagen.");
      return;
    }
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
          messageContent: feedbackTarget.messageContent,
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
        "Selecteer een Coachee om sterktes en aandachtspunten te bekijken.",
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
  const selectedClientSummary =
    selectedClient?.summary?.trim() ||
    "Selecteer een Coachee om details te bekijken.";

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
    setIsSummaryExpanded(false);
  }, [selectedClientId]);

  useEffect(() => {
    const summaryElement = summaryRef.current;
    if (!summaryElement || !selectedClient?.summary?.trim()) {
      setSummaryCanExpand(false);
      return;
    }

    const measureSummary = () => {
      const styles = window.getComputedStyle(summaryElement);
      const lineHeight =
        Number.parseFloat(styles.lineHeight) ||
        Number.parseFloat(styles.fontSize) * 1.5 ||
        0;

      const previousDisplay = summaryElement.style.display;
      const previousOverflow = summaryElement.style.overflow;
      const previousWebkitLineClamp = summaryElement.style.webkitLineClamp;

      summaryElement.style.display = "block";
      summaryElement.style.overflow = "visible";
      summaryElement.style.webkitLineClamp = "unset";

      const fullHeight = summaryElement.scrollHeight;

      summaryElement.style.display = previousDisplay;
      summaryElement.style.overflow = previousOverflow;
      summaryElement.style.webkitLineClamp = previousWebkitLineClamp;

      setSummaryCanExpand(fullHeight > lineHeight * 3 + 1);
    };

    measureSummary();
    window.addEventListener("resize", measureSummary);

    return () => {
      window.removeEventListener("resize", measureSummary);
    };
  }, [selectedClientId, selectedClient?.summary]);

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

  const clientDetailsPanelProps = {
    channelProps: {
      activeChannel,
      canUseSupervisorChannel,
      onChannelChange: setActiveChannel,
    },
    clientProps: {
      selectedClient: selectedClient ?? null,
      selectedClientInitials,
      selectedClientSummary,
      focusTags,
      strengthsAndWatchouts,
      summaryRef,
      isSummaryExpanded,
      summaryCanExpand,
      onToggleSummaryExpanded: () =>
        setIsSummaryExpanded((current) => !current),
    },
    editClientProps: {
      canEdit: canEditClients,
      isDialogOpen: isClientDialogOpen,
      onOpenChange: (open: boolean) => {
        setClientDialogOpen(open);
        if (!open) {
          setAvatarFile(null);
          setEditingClientId(null);
        }
      },
      onTriggerClick: () => {
        if (!selectedClient) return;
        setEditingClientId(selectedClient.id);
        setAvatarFile(null);
        setClientForm({
          name: selectedClient.name,
          managerName: selectedClient.managerName ?? "",
          focusArea: selectedClient.focusArea,
          summary: selectedClient.summary,
          goals: selectedClient.goals.join(", "),
          avatarUrl: selectedClient.avatarUrl ?? "",
          coachId: selectedClient.coachId ?? "",
        });
      },
      clientForm,
      setClientForm,
      avatarFile,
      setAvatarFile,
      avatarInputId: editClientAvatarInputId,
      isAdmin,
      coachOptions,
      isCoachOptionsLoading,
      coachOptionsError,
      deletingClientId,
      isSaving: isClientSaving,
      onSave: handleClientSave,
      onDelete: (clientId: string) => void handleClientDelete(clientId),
    },
    autoSendProps: {
      enabled: autoSendAfterTranscription,
      disabled: !selectedClient,
      onChange: setAutoSendAfterTranscription,
    },
    reportProps: {
      reports: clientReportList,
      isLoading: isReportLoading,
      isGenerating: isReportGenerating,
      disabled: !selectedClientId,
      error: reportError,
      onGenerate: handleGenerateReport,
      onOpen: handleOpenReport,
    },
    documentProps: {
      documents,
      isUploading: isDocUploading,
      onUpload: handleAttachmentButtonClick,
    },
  } as const;

  const sidebarProps = {
    showSidebar,
    isAdmin,
    userProps: {
      name: displayUser.name,
      image: displayUser.image,
      companyName: displayUser.companyName,
      companyLogoUrl: displayUser.companyLogoUrl,
      userInitial,
    },
    clientListProps: {
      clients: clientList,
      selectedClientId,
      onSelect: (clientId: string) => {
        setSelectedClientId(clientId);
        setActiveSidebarTab("dashboard");
        if (isMobile) {
          setMobileView("chat");
        }
      },
    },
    createClientProps: {
      isDialogOpen: isCreateClientDialogOpen,
      onDialogOpenChange: (open: boolean) => {
        setCreateClientDialogOpen(open);
        if (!open) {
          setNewClientForm({
            name: "",
            managerName: "",
            focusArea: "",
            summary: "",
            goals: "",
            coachId: "",
          });
          setNewClientAvatarFile(null);
        }
      },
      form: newClientForm,
      setForm: setNewClientForm,
      avatarFile: newClientAvatarFile,
      setAvatarFile: setNewClientAvatarFile,
      avatarInputId: newClientAvatarInputId,
      initials: newClientInitials,
      coachOptions,
      isCoachOptionsLoading,
      coachOptionsError,
      isCreating: isCreatingClient,
      onSubmit: handleNewClientSubmit,
    },
    navigationProps: {
      activeTab: activeSidebarTab,
      onNavigate: (tab: ActiveSidebarTab) => {
        setActiveSidebarTab(tab);
        if (isMobile) {
          setMobileView("chat");
        }
      },
      isAdmin,
    },
    settingsProps: {
      sections: settingsSections,
      activeTab: activeSettingsTab,
      onTabChange: setActiveSettingsTab,
      activeSection: activeSettings,
      displayUser: {
        name: displayUser.name,
        email: displayUser.email,
        image: displayUser.image,
      },
      userForm,
      setUserForm,
      userAvatarFile,
      setUserAvatarFile,
      companyLogoFile,
      setCompanyLogoFile,
      isUserSaving,
      onSave: handleUserSave,
      userAvatarInputId,
      companyLogoInputId,
    },
    footerProps: {
      isSigningOut,
      onSignOut: handleSignOut,
    },
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
        <DashboardSidebar {...sidebarProps} />

        {/* Main Content Area */}
        <main
          className={[
            "flex flex-1 min-h-0 flex-col min-w-0 overflow-hidden",
            showMainContent ? "flex" : "hidden lg:flex",
          ].join(" ")}
        >
          {activeSidebarTab === "prompt-center" ? (
            <PromptCenterPanel
              modelProps={{
                isLoading: isModelLoading,
                availableModels,
                coachModel,
                setCoachModel,
                overseerModel,
                setOverseerModel,
                isSaving: isModelSaving,
                onSave: handleModelSave,
              }}
              promptProps={{
                coach: {
                  value: coachPrompt,
                  onChange: setCoachPrompt,
                  updatedAt: coachPromptUpdatedAt,
                  isLoading: isCoachPromptLoading,
                  isSaving: isCoachPromptSaving,
                  onSave: handleCoachPromptSave,
                },
                overseer: {
                  value: overseerPrompt,
                  onChange: setOverseerPrompt,
                  updatedAt: overseerPromptUpdatedAt,
                  isLoading: isOverseerPromptLoading,
                  isSaving: isOverseerPromptSaving,
                  onSave: handleOverseerPromptSave,
                },
                report: {
                  value: reportPrompt,
                  onChange: setReportPrompt,
                  updatedAt: reportPromptUpdatedAt,
                  isLoading: isReportPromptLoading,
                  isSaving: isReportPromptSaving,
                  onSave: handleReportPromptSave,
                },
                isRefining: isRefiningPrompt,
                refineTarget,
                onRegenerate: handlePromptRegenerate,
              }}
              layerProps={{
                layers: aiLayers,
                isLoading: isLayerLoading,
                hasModels: availableModels.length > 0,
                actionId: layerActionId,
                actionType: layerActionType,
                getModelLabel,
                onNew: () => openLayerDialogFor(null),
                onEdit: openLayerDialogFor,
                onDelete: handleLayerDelete,
                onToggle: handleLayerToggle,
              }}
              feedbackProps={{
                isLoading: isFeedbackLoading,
                coachItems: coachFeedbackItems,
                overseerItems: overseerFeedbackItems,
              }}
            />
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
                        <MobileChatHeader
                          selectedClient={selectedClient}
                          selectedClientInitials={selectedClientInitials}
                          onBack={() => setMobileView("list")}
                          onViewDetails={() => {
                            if (isMobile) {
                              setMobileView("details");
                            }
                          }}
                        />
                      )}
                      {activeChannel === "coach" ? (
                        <CoachChatPanel
                          historyProps={{
                            messages,
                            messagesRef: coachMessagesRef,
                            userName: displayUser.name,
                            userImage: displayUser.image,
                            isAdmin,
                            onFeedback: openFeedbackDialog,
                          }}
                          inputProps={{
                            value: coachInput,
                            onChange: setCoachInput,
                            onSubmit: handleCoachSubmit,
                            disabled:
                              !selectedClient || isSelectedClientCoachPending,
                          }}
                          voiceProps={{
                            onTranscript: handleVoiceTranscript,
                            onError: handleVoiceError,
                            attachmentInputRef,
                            onAttachmentChange: handleAttachmentChange,
                          }}
                        />
                      ) : (
                        <OverseerPanel
                          threadProps={{
                            messages: overseerThread,
                            messagesRef: overseerMessagesRef,
                            clientNameById,
                            userName: displayUser.name,
                            userImage: displayUser.image,
                            isAdmin,
                            onFeedback: openFeedbackDialog,
                          }}
                          inputProps={{
                            value: overseerInput,
                            onChange: setOverseerInput,
                            isLoading: isOverseerLoading,
                            onSubmit: handleOverseerSubmit,
                          }}
                        />
                      )}
                    </div>
                  </section>
                  <aside className="hidden lg:flex min-h-0 w-84 shrink-0 pt-4 flex-col text-sm text-slate-700">
                    <ClientDetailsPanel variant="desktop" {...clientDetailsPanelProps} />
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
                  {selectedClient?.name ?? "Selecteer een Coachee"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className="text-xs font-semibold text-slate-600"
              >
                coachees
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ClientDetailsPanel variant="mobile" {...clientDetailsPanelProps} />
            </div>
          </div>
        )}
      </div>

      <LayerDialog
        open={layerDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeLayerDialog();
          }
        }}
        editingLayer={editingLayer}
        layerForm={layerForm}
        setLayerForm={setLayerForm}
        availableModels={availableModels}
        isSaving={isLayerSaving}
        onSave={handleLayerSubmit}
        onCancel={closeLayerDialog}
      />

      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeFeedbackDialog();
          } else {
            setFeedbackDialogOpen(true);
          }
        }}
        feedbackTarget={feedbackTarget}
        feedbackText={feedbackText}
        setFeedbackText={setFeedbackText}
        isSubmitting={isFeedbackSubmitting}
        onSubmit={handleFeedbackSubmit}
        onCancel={closeFeedbackDialog}
      />
    </>
  );
}
