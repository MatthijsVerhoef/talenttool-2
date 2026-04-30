"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AgentMessage } from "@/lib/data/sessions";
import type {
  AgentFeedbackItem,
  AgentKindType,
  AiLayerTarget,
  AiResponseLayerRow,
  ModelOption,
} from "@/components/admin/prompt-center-panel";
import type { FeedbackTarget } from "@/components/coach/feedback-dialog";

interface UseAdminPanelOptions {
  isAdmin: boolean;
  onError: (message: string | null) => void;
}

export function useAdminPanel({ isAdmin, onError }: UseAdminPanelOptions) {
  // Models
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [coachModel, setCoachModel] = useState("");
  const [overseerModel, setOverseerModel] = useState("");
  const [isModelLoading, setModelLoading] = useState(true);
  const [isModelSaving, setModelSaving] = useState(false);

  // Prompts
  const [coachPrompt, setCoachPrompt] = useState("");
  const [coachPromptUpdatedAt, setCoachPromptUpdatedAt] = useState<string | null>(null);
  const [isCoachPromptLoading, setCoachPromptLoading] = useState(true);
  const [isCoachPromptSaving, setCoachPromptSaving] = useState(false);

  const [overseerPrompt, setOverseerPrompt] = useState("");
  const [overseerPromptUpdatedAt, setOverseerPromptUpdatedAt] = useState<string | null>(null);
  const [isOverseerPromptLoading, setOverseerPromptLoading] = useState(true);
  const [isOverseerPromptSaving, setOverseerPromptSaving] = useState(false);

  const [reportPrompt, setReportPrompt] = useState("");
  const [reportPromptUpdatedAt, setReportPromptUpdatedAt] = useState<string | null>(null);
  const [isReportPromptLoading, setReportPromptLoading] = useState(true);
  const [isReportPromptSaving, setReportPromptSaving] = useState(false);

  const [refineTarget, setRefineTarget] = useState<AgentKindType | null>(null);
  const [isRefiningPrompt, setRefiningPrompt] = useState(false);

  // Feedback
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isFeedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState<AgentFeedbackItem[]>([]);
  const [isFeedbackLoading, setFeedbackLoading] = useState(false);

  // Coach options (admin-only, for assigning coaches to clients)
  const [coachOptions, setCoachOptions] = useState<
    Array<{ id: string; name?: string | null; email: string }>
  >([]);
  const [isCoachOptionsLoading, setCoachOptionsLoading] = useState(false);
  const [coachOptionsError, setCoachOptionsError] = useState<string | null>(null);
  const [hasRequestedCoachOptions, setHasRequestedCoachOptions] = useState(false);

  // AI Layers
  const [aiLayers, setAiLayers] = useState<AiResponseLayerRow[]>([]);
  const [isLayerLoading, setLayerLoading] = useState(false);
  const [isLayerSaving, setLayerSaving] = useState(false);
  const [layerDialogOpen, setLayerDialogOpen] = useState(false);
  const [editingLayer, setEditingLayer] = useState<AiResponseLayerRow | null>(null);
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
  const [layerActionType, setLayerActionType] = useState<"toggle" | "delete" | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────

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

  const coachFeedbackItems = useMemo(
    () => recentFeedback.filter((item) => item.agentType === "COACH").slice(0, 5),
    [recentFeedback]
  );

  const overseerFeedbackItems = useMemo(
    () => recentFeedback.filter((item) => item.agentType === "OVERSEER").slice(0, 5),
    [recentFeedback]
  );

  // ── Fetchers ─────────────────────────────────────────────────────────────

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
      onError((fetchError as Error).message ?? "Coachprompt laden is mislukt.");
    } finally {
      setCoachPromptLoading(false);
    }
  }, [onError]);

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
      onError((fetchError as Error).message ?? "Overzichtsprompt laden is mislukt.");
    } finally {
      setOverseerPromptLoading(false);
    }
  }, [isAdmin, onError]);

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
      onError((fetchError as Error).message ?? "Rapportprompt laden is mislukt.");
    } finally {
      setReportPromptLoading(false);
    }
  }, [isAdmin, onError]);

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
      const normalizedOptions: ModelOption[] = Array.isArray(data.availableModels)
        ? (data.availableModels as ModelOption[]).filter(
            (option) =>
              typeof option?.value === "string" && typeof option?.label === "string"
          )
        : [];
      setAvailableModels(normalizedOptions);
      setCoachModel(typeof data.coachModel === "string" ? data.coachModel : "");
      setOverseerModel(typeof data.overseerModel === "string" ? data.overseerModel : "");
    } catch (fetchError) {
      console.error(fetchError);
      onError((fetchError as Error).message ?? "AI-modellen laden is mislukt.");
    } finally {
      setModelLoading(false);
    }
  }, [isAdmin, onError]);

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
      onError((fetchError as Error).message ?? "Feedback ophalen is mislukt.");
    } finally {
      setFeedbackLoading(false);
    }
  }, [isAdmin, onError]);

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
      onError((fetchError as Error).message ?? "AI-lagen laden is mislukt.");
    } finally {
      setLayerLoading(false);
    }
  }, [isAdmin, onError]);

  // ── Effects ───────────────────────────────────────────────────────────────

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
          fetchError instanceof Error ? fetchError.message : "Kan coaches niet ophalen."
        );
        setHasRequestedCoachOptions(false);
      } finally {
        setCoachOptionsLoading(false);
      }
    };

    void loadCoaches();
  }, [isAdmin, hasRequestedCoachOptions]);

  useEffect(() => {
    void fetchCoachPrompt();
    void fetchReportPrompt();
    void fetchAiLayers();
    void fetchModelSettings();
    if (isAdmin) {
      void fetchOverseerPrompt();
    } else {
      setOverseerPrompt("");
      setOverseerPromptUpdatedAt(null);
      setReportPrompt("");
      setReportPromptUpdatedAt(null);
    }
  }, [
    fetchCoachPrompt,
    fetchReportPrompt,
    fetchAiLayers,
    fetchModelSettings,
    fetchOverseerPrompt,
    isAdmin,
  ]);

  useEffect(() => {
    void fetchFeedbackList();
  }, [fetchFeedbackList]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCoachPromptSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coachPrompt.trim()) {
      onError("Prompt mag niet leeg les zijn.");
      return;
    }
    setCoachPromptSaving(true);
    onError(null);
    try {
      const response = await fetch("/api/prompts/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: coachPrompt }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Prompt opslaan is mislukt.");
      setCoachPrompt(data.prompt ?? coachPrompt);
      setCoachPromptUpdatedAt(data.updatedAt ?? null);
    } catch (saveError) {
      console.error(saveError);
      onError((saveError as Error).message ?? "Coachprompt opslaan is mislukt.");
    } finally {
      setCoachPromptSaving(false);
    }
  }

  async function handleOverseerPromptSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overseerPrompt.trim()) {
      onError("Prompt mag niet leeg zijn.");
      return;
    }
    setOverseerPromptSaving(true);
    onError(null);
    try {
      const response = await fetch("/api/prompts/overseer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: overseerPrompt }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Prompt opslaan is mislukt.");
      setOverseerPrompt(data.prompt ?? overseerPrompt);
      setOverseerPromptUpdatedAt(data.updatedAt ?? null);
    } catch (saveError) {
      console.error(saveError);
      onError((saveError as Error).message ?? "Overzichtsprompt opslaan is mislukt.");
    } finally {
      setOverseerPromptSaving(false);
    }
  }

  async function handleReportPromptSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportPrompt.trim()) {
      onError("Prompt mag niet leeg zijn.");
      return;
    }
    setReportPromptSaving(true);
    onError(null);
    try {
      const response = await fetch("/api/prompts/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: reportPrompt }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Prompt opslaan is mislukt.");
      setReportPrompt(data.prompt ?? reportPrompt);
      setReportPromptUpdatedAt(data.updatedAt ?? null);
    } catch (saveError) {
      console.error(saveError);
      onError((saveError as Error).message ?? "Rapportprompt opslaan is mislukt.");
    } finally {
      setReportPromptSaving(false);
    }
  }

  async function handleModelSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coachModel || !overseerModel) {
      onError("Selecteer eerst beide AI-modellen.");
      return;
    }
    setModelSaving(true);
    onError(null);
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
      const normalizedOptions: ModelOption[] = Array.isArray(data.availableModels)
        ? (data.availableModels as ModelOption[]).filter(
            (option) =>
              typeof option?.value === "string" && typeof option?.label === "string"
          )
        : availableModels;
      if (normalizedOptions.length) {
        setAvailableModels(normalizedOptions);
      }
      setCoachModel(typeof data.coachModel === "string" ? data.coachModel : coachModel);
      setOverseerModel(
        typeof data.overseerModel === "string" ? data.overseerModel : overseerModel
      );
    } catch (saveError) {
      console.error(saveError);
      onError((saveError as Error).message ?? "AI-modellen opslaan is mislukt.");
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
      onError("Vul alle verplichte velden voor de AI-laag in.");
      return;
    }
    setLayerSaving(true);
    onError(null);
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
      onError((saveError as Error).message ?? "Opslaan van AI-laag is mislukt.");
    } finally {
      setLayerSaving(false);
    }
  }

  async function handleLayerToggle(layer: AiResponseLayerRow) {
    setLayerActionId(layer.id);
    setLayerActionType("toggle");
    onError(null);
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
      onError((updateError as Error).message ?? "Bijwerken van AI-laag is mislukt.");
    } finally {
      setLayerActionId(null);
      setLayerActionType(null);
    }
  }

  async function handleLayerDelete(layerId: string) {
    setLayerActionId(layerId);
    setLayerActionType("delete");
    onError(null);
    try {
      const response = await fetch(`/api/ai-layers/${layerId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Verwijderen van AI-laag is mislukt.");
      }
      setAiLayers((prev) => prev.filter((item) => item.id !== layerId));
    } catch (deleteError) {
      console.error(deleteError);
      onError((deleteError as Error).message ?? "Verwijderen van AI-laag is mislukt.");
    } finally {
      setLayerActionId(null);
      setLayerActionType(null);
    }
  }

  function openFeedbackDialog(agentType: AgentKindType, message: AgentMessage) {
    if (message.id.startsWith("temp-")) {
      onError("Wacht tot het antwoord volledig is opgeslagen.");
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
      onError("Feedback mag niet leeg zijn.");
      return;
    }
    setFeedbackSubmitting(true);
    onError(null);
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
      onError((feedbackError as Error).message ?? "Feedback versturen is mislukt.");
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  async function handlePromptRegenerate(agentType: AgentKindType) {
    setRefiningPrompt(true);
    setRefineTarget(agentType);
    onError(null);
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
      onError((refineError as Error).message ?? "Prompt herschrijven is mislukt.");
    } finally {
      setRefiningPrompt(false);
      setRefineTarget(null);
    }
  }

  return {
    // Models
    availableModels,
    coachModel,
    setCoachModel,
    overseerModel,
    setOverseerModel,
    isModelLoading,
    isModelSaving,
    handleModelSave,
    getModelLabel,
    // Prompts
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
    // Feedback
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
    // Coach options
    coachOptions,
    isCoachOptionsLoading,
    coachOptionsError,
    // AI Layers
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
  };
}
