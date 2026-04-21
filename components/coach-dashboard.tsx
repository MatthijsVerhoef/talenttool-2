"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ArrowLeft } from "lucide-react";
import type { UserRole } from "@prisma/client";

import { AdminUserManagement } from "@/components/admin/user-management";
import { PromptCenterPanel } from "@/components/admin/prompt-center-panel";
import { LayerDialog } from "@/components/admin/layer-dialog";
import { FeedbackDialog } from "@/components/coach/feedback-dialog";
import { ClientDetailsPanel } from "@/components/coach/client-details-panel";
import { OverseerPanel } from "@/components/overseer/overseer-panel";
import { CoachChatPanel } from "@/components/chat/coach-chat-panel";
import { MobileChatHeader } from "@/components/chat/mobile-chat-header";
import {
  DashboardSidebar,
  type ActiveSidebarTab,
  type SettingsTab,
} from "@/components/clients/dashboard-sidebar";

import type { ClientProfile } from "@/lib/data/clients";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCoachSession } from "@/hooks/use-coach-session";
import { useAdminPanel } from "@/hooks/use-admin-panel";
import { useDocumentManager } from "@/hooks/use-document-manager";
import { useClientManager } from "@/hooks/use-client-manager";
import { useReportManager } from "@/hooks/use-report-manager";
import { useUserManager } from "@/hooks/use-user-manager";
import { useOverseerSession } from "@/hooks/use-overseer-session";

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

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

export function CoachDashboard({ clients, currentUser }: CoachDashboardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [clientList, setClientList] = useState<ClientProfile[]>(clients);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clients[0]?.id ?? null
  );
  const [autoSendAfterTranscription, setAutoSendAfterTranscription] =
    useState(false);
  const [activeChannel, setActiveChannel] = useState<"coach" | "meta">("coach");
  const [mobileView, setMobileView] = useState<"list" | "chat" | "details">(
    () => {
      if (typeof window === "undefined") {
        return "chat";
      }
      return window.innerWidth < 768 ? "list" : "chat";
    }
  );
  const [activeSidebarTab, setActiveSidebarTab] =
    useState<ActiveSidebarTab>("dashboard");
  const [error, setError] = useState<string | null>(null);
  const {
    displayUser,
    userForm,
    setUserForm,
    userAvatarFile,
    setUserAvatarFile,
    companyLogoFile,
    setCompanyLogoFile,
    isUserSaving,
    isSigningOut,
    userAvatarInputId,
    companyLogoInputId,
    isAdmin,
    canEditClients,
    canUseSupervisorChannel,
    userInitial,
    handleUserSave,
    handleSignOut,
  } = useUserManager({ currentUser, onError: setError });
  const {
    coachMessagesRef,
    clientHistories,
    coachInput,
    setCoachInput,
    messages,
    isSelectedClientCoachPending,
    handleCoachSubmit,
    handleVoiceTranscript,
    handleVoiceError,
    fetchClientHistory,
    cleanupClientState,
  } = useCoachSession({
    selectedClientId,
    autoSendAfterTranscription,
    onError: setError,
  });
  const {
    documents,
    selectedClientDocs,
    isDocUploading,
    attachmentInputRef,
    fetchClientDocuments,
    handleAttachmentButtonClick,
    handleAttachmentChange,
    cleanupClientDocuments,
  } = useDocumentManager({ selectedClientId, onError: setError });
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("profile");
  const {
    availableModels,
    coachModel,
    setCoachModel,
    overseerModel,
    setOverseerModel,
    isModelLoading,
    isModelSaving,
    handleModelSave,
    getModelLabel,
    coachPrompt,
    setCoachPrompt,
    coachPromptUpdatedAt,
    isCoachPromptLoading,
    isCoachPromptSaving,
    handleCoachPromptSave,
    overseerPrompt,
    setOverseerPrompt,
    overseerPromptUpdatedAt,
    isOverseerPromptLoading,
    isOverseerPromptSaving,
    handleOverseerPromptSave,
    reportPrompt,
    setReportPrompt,
    reportPromptUpdatedAt,
    isReportPromptLoading,
    isReportPromptSaving,
    handleReportPromptSave,
    isRefiningPrompt,
    refineTarget,
    handlePromptRegenerate,
    feedbackDialogOpen,
    setFeedbackDialogOpen,
    feedbackTarget,
    feedbackText,
    setFeedbackText,
    isFeedbackSubmitting,
    isFeedbackLoading,
    coachFeedbackItems,
    overseerFeedbackItems,
    openFeedbackDialog,
    closeFeedbackDialog,
    handleFeedbackSubmit,
    coachOptions,
    isCoachOptionsLoading,
    coachOptionsError,
    aiLayers,
    isLayerLoading,
    isLayerSaving,
    layerDialogOpen,
    editingLayer,
    layerForm,
    setLayerForm,
    layerActionId,
    layerActionType,
    openLayerDialogFor,
    closeLayerDialog,
    handleLayerSubmit,
    handleLayerToggle,
    handleLayerDelete,
  } = useAdminPanel({ isAdmin, onError: setError });
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
  const {
    editClientAvatarInputId,
    newClientAvatarInputId,
    isClientDialogOpen,
    editingClientId,
    clientForm,
    setClientForm,
    avatarFile,
    setAvatarFile,
    isClientSaving,
    openEditDialog,
    onEditDialogOpenChange,
    handleClientSave,
    isCreateClientDialogOpen,
    newClientForm,
    setNewClientForm,
    newClientAvatarFile,
    setNewClientAvatarFile,
    newClientInitials,
    isCreatingClient,
    onCreateDialogOpenChange,
    handleNewClientSubmit,
    deletingClientId,
    handleClientDelete,
  } = useClientManager({
    selectedClientId,
    selectedClient,
    isAdmin,
    clientList,
    onError: setError,
    onClientSaved: (client) =>
      setClientList((prev) =>
        prev.map((c) => (c.id === client.id ? client : c))
      ),
    onClientCreated: (client) => {
      setClientList((prev) => [...prev, client]);
      setSelectedClientId(client.id);
    },
    onClientDeleted: (clientId, nextSelectedId) => {
      cleanupClientState(clientId);
      cleanupClientDocuments(clientId);
      cleanupClientReports(clientId);
      setClientList((prev) => prev.filter((c) => c.id !== clientId));
      setSelectedClientId(nextSelectedId);
    },
    onRefresh: router.refresh,
  });
  const {
    clientReportList,
    isReportGenerating,
    isReportLoading,
    reportError,
    handleGenerateReport,
    handleRefreshReport,
    handleOpenReport,
    cleanupClientReports,
  } = useReportManager({ selectedClientId });
  const {
    overseerThread,
    overseerInput,
    setOverseerInput,
    isOverseerLoading,
    overseerMessagesRef,
    handleOverseerSubmit,
  } = useOverseerSession({
    selectedClientId,
    canUseSupervisorChannel,
    onError: setError,
  });
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
  useEffect(() => {
    if (!selectedClientId) return;
    if (!selectedClientHistory) {
      void fetchClientHistory(selectedClientId);
    }
    if (!selectedClientDocs) {
      void fetchClientDocuments(selectedClientId);
    }
  }, [selectedClientId, selectedClientHistory, selectedClientDocs]);

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
      onOpenChange: onEditDialogOpenChange,
      onTriggerClick: () => {
        if (!selectedClient) return;
        openEditDialog(selectedClient);
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
      onDialogOpenChange: onCreateDialogOpenChange,
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
                    <ClientDetailsPanel
                      variant="desktop"
                      {...clientDetailsPanelProps}
                    />
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
              <ClientDetailsPanel
                variant="mobile"
                {...clientDetailsPanelProps}
              />
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
