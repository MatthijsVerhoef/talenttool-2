"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types — exported so CoachDashboard can import them instead of redefining
// ---------------------------------------------------------------------------

export type AgentKindType = "COACH" | "OVERSEER";
export type AiLayerTarget = "ALL" | "COACH" | "OVERSEER";

export interface ModelOption {
  value: string;
  label: string;
}

export interface AiResponseLayerRow {
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

export interface AgentFeedbackItem {
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

// ---------------------------------------------------------------------------
// Prop groups
// ---------------------------------------------------------------------------

export interface ModelProps {
  isLoading: boolean;
  availableModels: ModelOption[];
  coachModel: string;
  setCoachModel: (value: string) => void;
  overseerModel: string;
  setOverseerModel: (value: string) => void;
  isSaving: boolean;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}

export interface PromptEntry {
  value: string;
  onChange: (value: string) => void;
  updatedAt: string | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}

export interface PromptProps {
  coach: PromptEntry;
  overseer: PromptEntry;
  report: PromptEntry;
  isRefining: boolean;
  refineTarget: AgentKindType | null;
  onRegenerate: (target: AgentKindType) => void;
}

export interface LayerProps {
  layers: AiResponseLayerRow[];
  isLoading: boolean;
  hasModels: boolean;
  actionId: string | null;
  actionType: "toggle" | "delete" | null;
  getModelLabel: (value: string) => string;
  onNew: () => void;
  onEdit: (layer: AiResponseLayerRow) => void;
  onDelete: (id: string) => void;
  onToggle: (layer: AiResponseLayerRow) => void;
}

export interface FeedbackProps {
  isLoading: boolean;
  coachItems: AgentFeedbackItem[];
  overseerItems: AgentFeedbackItem[];
}

interface PromptCenterPanelProps {
  modelProps: ModelProps;
  promptProps: PromptProps;
  layerProps: LayerProps;
  feedbackProps: FeedbackProps;
}

// ---------------------------------------------------------------------------
// Constants local to this panel
// ---------------------------------------------------------------------------

const layerTargetLabels: Record<AiLayerTarget, string> = {
  COACH: "Coachkanaal",
  OVERSEER: "Overzichtscoach",
  ALL: "Beide agenten",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromptCenterPanel({
  modelProps,
  promptProps,
  layerProps,
  feedbackProps,
}: PromptCenterPanelProps) {
  return (
    <div className="p-0 md:p-2 flex-1 min-h-0 overflow-hidden h-full">
      <div className="relative flex h-full min-h-0 flex-col rounded-none md:rounded-[36px] overflow-hidden bg-white/25 backdrop-blur-2xl backdrop-saturate-120">
        {/* Border overlay */}
        <div className="pointer-events-none absolute inset-0 md:rounded-[36px] border border-white z-10" />
        {/* Top highlight */}
        <div className="pointer-events-none absolute inset-0 md:rounded-[36px] bg-gradient-to-b from-white/45 via-white/18 to-transparent z-10" />
        {/* Content */}
        <div className="relative z-20 flex flex-col h-full min-h-0">
          <header className="relative flex shrink-0 items-center justify-between px-8 pt-4 lg:px-12 lg:pt-12 lg:pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Administratie
              </p>
              <h1 className="text-lg font-semibold text-slate-900">
                Prompthistorie &amp; Feedback
              </h1>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-5 lg:px-10 lg:pb-5 lg:pt-0">
            <div className="flex flex-col gap-5">
              {/* ── Models ─────────────────────────────────────────────── */}
              <div className="rounded-3xl border border-white/60 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      AI-modellen
                    </p>
                    <p className="text-xs text-slate-500">
                      Kies welk model beide agenten gebruiken.
                    </p>
                  </div>
                </div>
                {modelProps.isLoading ? (
                  <p className="text-sm text-slate-500">
                    Modellen worden geladen...
                  </p>
                ) : modelProps.availableModels.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Geen beschikbare modellen gevonden.
                  </p>
                ) : (
                  <form
                    onSubmit={modelProps.onSave}
                    className="grid gap-4 lg:grid-cols-2"
                  >
                    <label className="flex flex-col gap-1 text-sm">
                      Coach assistent
                      <select
                        value={modelProps.coachModel}
                        onChange={(event) =>
                          modelProps.setCoachModel(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm focus:border-[#2ea3f2] focus:outline-none"
                        required
                      >
                        <option value="" disabled>
                          Kies een model
                        </option>
                        {modelProps.availableModels.map((option) => (
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
                        value={modelProps.overseerModel}
                        onChange={(event) =>
                          modelProps.setOverseerModel(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm focus:border-[#2ea3f2] focus:outline-none"
                        required
                      >
                        <option value="" disabled>
                          Kies een model
                        </option>
                        {modelProps.availableModels.map((option) => (
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
                        disabled={modelProps.isSaving}
                        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {modelProps.isSaving
                          ? "Opslaan..."
                          : "AI-modellen opslaan"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* ── Prompts ────────────────────────────────────────────── */}
              {promptProps.coach.isLoading ? (
                <div className="rounded-3xl border border-white/60 bg-white p-5 text-sm text-slate-500">
                  Coachprompt wordt geladen...
                </div>
              ) : (
                <form
                  onSubmit={promptProps.coach.onSave}
                  className="rounded-3xl border border-white/60 bg-white p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Coachprompt
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Gebruik dit om de toon en structuur van cliëntcoaching
                        te sturen.
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Laatste update:{" "}
                        {promptProps.coach.updatedAt
                          ? new Date(
                              promptProps.coach.updatedAt
                            ).toLocaleString()
                          : "Onbekend"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => promptProps.onRegenerate("COACH")}
                      disabled={
                        promptProps.isRefining &&
                        promptProps.refineTarget === "COACH"
                      }
                      className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                    >
                      {promptProps.isRefining &&
                      promptProps.refineTarget === "COACH"
                        ? "Herschrijven..."
                        : "Herschrijf met feedback"}
                    </button>
                  </div>
                  <textarea
                    value={promptProps.coach.value}
                    onChange={(event) =>
                      promptProps.coach.onChange(event.target.value)
                    }
                    className="min-h-[320px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:border-[#2ea3f2] focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={promptProps.coach.isSaving}
                      className="rounded-full bg-[#2ea3f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b8fd9] disabled:opacity-50"
                    >
                      {promptProps.coach.isSaving ? "Opslaan..." : "Opslaan"}
                    </button>
                  </div>
                </form>
              )}

              {promptProps.overseer.isLoading ? (
                <div className="rounded-3xl border border-white/60 bg-white p-5 text-sm text-slate-500">
                  Overzichtsprompt wordt geladen...
                </div>
              ) : (
                <form
                  onSubmit={promptProps.overseer.onSave}
                  className="rounded-3xl border border-white/60 bg-white p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Overzichtscoach prompt
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Richtlijnen voor trend- en risicoanalyses.
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Laatste update:{" "}
                        {promptProps.overseer.updatedAt
                          ? new Date(
                              promptProps.overseer.updatedAt
                            ).toLocaleString()
                          : "Onbekend"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => promptProps.onRegenerate("OVERSEER")}
                      disabled={
                        promptProps.isRefining &&
                        promptProps.refineTarget === "OVERSEER"
                      }
                      className="shrink-0 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-white disabled:opacity-50"
                    >
                      {promptProps.isRefining &&
                      promptProps.refineTarget === "OVERSEER"
                        ? "Herschrijven..."
                        : "Herschrijf met feedback"}
                    </button>
                  </div>
                  <textarea
                    value={promptProps.overseer.value}
                    onChange={(event) =>
                      promptProps.overseer.onChange(event.target.value)
                    }
                    className="min-h-[320px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:border-purple-400 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={promptProps.overseer.isSaving}
                      className="rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                    >
                      {promptProps.overseer.isSaving ? "Opslaan..." : "Opslaan"}
                    </button>
                  </div>
                </form>
              )}

              {promptProps.report.isLoading ? (
                <div className="rounded-3xl border border-white/60 bg-white p-5 text-sm text-slate-500">
                  Rapportprompt wordt geladen...
                </div>
              ) : (
                <form
                  onSubmit={promptProps.report.onSave}
                  className="rounded-3xl border border-white/60 bg-white p-5 space-y-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Rapportgenerator prompt
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Bepaalt hoe automatische cliëntrapporten worden opgebouwd.
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Laatste update:{" "}
                      {promptProps.report.updatedAt
                        ? new Date(
                            promptProps.report.updatedAt
                          ).toLocaleString()
                        : "Onbekend"}
                    </p>
                  </div>
                  <textarea
                    value={promptProps.report.value}
                    onChange={(event) =>
                      promptProps.report.onChange(event.target.value)
                    }
                    className="min-h-[320px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:border-[#2ea3f2] focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={promptProps.report.isSaving}
                      className="rounded-full bg-[#2ea3f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b8fd9] disabled:opacity-50"
                    >
                      {promptProps.report.isSaving ? "Opslaan..." : "Opslaan"}
                    </button>
                  </div>
                </form>
              )}

              {/* ── AI Layers ──────────────────────────────────────────── */}
              <div className="rounded-3xl border border-white/60 bg-white p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ShieldCheck className="size-4 text-emerald-500" />
                      <span>AI-lagen</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Laat antwoorden extra controles doorlopen voordat ze naar
                      de coach gaan.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={layerProps.onNew}
                    disabled={!layerProps.hasModels}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                    <span>Nieuwe laag</span>
                  </button>
                </div>
                {layerProps.isLoading ? (
                  <p className="text-sm text-slate-500">
                    AI-lagen worden geladen...
                  </p>
                ) : layerProps.layers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Nog geen AI-lagen ingesteld. Voeg een laag toe om
                    schrijfstijl, feitelijke juistheid of andere voorwaarden af
                    te dwingen.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {layerProps.layers.map((layer) => (
                      <li
                        key={layer.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 p-4"
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
                                {layerProps.getModelLabel(layer.model)}
                              </span>{" "}
                              • Temperatuur: {layer.temperature.toFixed(1)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => layerProps.onEdit(layer)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Bewerken
                            </button>
                            <button
                              type="button"
                              onClick={() => layerProps.onDelete(layer.id)}
                              disabled={
                                layerProps.actionId === layer.id &&
                                layerProps.actionType === "delete"
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Trash2 className="size-3.5" />
                              {layerProps.actionId === layer.id &&
                              layerProps.actionType === "delete"
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
                            onClick={() => layerProps.onToggle(layer)}
                            disabled={
                              layerProps.actionId === layer.id &&
                              layerProps.actionType === "toggle"
                            }
                            className={[
                              "rounded-full px-3 py-1.5 text-xs font-semibold",
                              layer.isEnabled
                                ? "border border-amber-200 text-amber-700 hover:bg-amber-50"
                                : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                              layerProps.actionId === layer.id &&
                              layerProps.actionType === "toggle"
                                ? "opacity-50"
                                : "",
                            ].join(" ")}
                          >
                            {layerProps.actionId === layer.id &&
                            layerProps.actionType === "toggle"
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

              {/* ── Feedback ───────────────────────────────────────────── */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-white/60 bg-white p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Feedback coach assistent
                      </p>
                      <p className="text-xs text-slate-500">
                        {feedbackProps.coachItems.length || 0} items
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {feedbackProps.coachItems.length}
                    </span>
                  </div>
                  {feedbackProps.isLoading ? (
                    <p className="text-sm text-slate-500">
                      Feedback wordt geladen...
                    </p>
                  ) : feedbackProps.coachItems.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Nog geen feedback voor deze agent.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {feedbackProps.coachItems.map((item) => (
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
                <div className="rounded-3xl border border-white/60 bg-white p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Feedback Overzichtscoach
                      </p>
                      <p className="text-xs text-slate-500">
                        {feedbackProps.overseerItems.length || 0} items
                      </p>
                    </div>
                    <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700">
                      {feedbackProps.overseerItems.length}
                    </span>
                  </div>
                  {feedbackProps.isLoading ? (
                    <p className="text-sm text-slate-500">
                      Feedback wordt geladen...
                    </p>
                  ) : feedbackProps.overseerItems.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Nog geen feedback voor deze agent.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {feedbackProps.overseerItems.map((item) => (
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
    </div>
  );
}
