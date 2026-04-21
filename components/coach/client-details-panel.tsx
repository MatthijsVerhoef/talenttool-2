"use client";

import { Edit2, UserRound } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ReportPanel } from "@/components/reports/report-panel";
import type { Report } from "@/components/reports/report-panel";
import type { ClientProfile } from "@/lib/data/clients";
import type { ClientDocument } from "@/lib/data/documents";

export type { Report };

export interface ClientForm {
  name: string;
  managerName: string;
  focusArea: string;
  summary: string;
  goals: string;
  avatarUrl: string;
  coachId: string;
}

interface ChannelProps {
  activeChannel: "coach" | "meta";
  canUseSupervisorChannel: boolean;
  onChannelChange: (channel: "coach" | "meta") => void;
}

interface ClientSummaryProps {
  selectedClient: ClientProfile | null;
  selectedClientInitials: string;
  selectedClientSummary: string;
  focusTags: string[];
  strengthsAndWatchouts: string[];
  summaryRef: React.RefObject<HTMLParagraphElement | null>;
  isSummaryExpanded: boolean;
  summaryCanExpand: boolean;
  onToggleSummaryExpanded: () => void;
}

interface EditClientProps {
  canEdit: boolean;
  isDialogOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTriggerClick: () => void;
  clientForm: ClientForm;
  setClientForm: (updater: (prev: ClientForm) => ClientForm) => void;
  avatarFile: File | null;
  setAvatarFile: (file: File | null) => void;
  avatarInputId: string;
  isAdmin: boolean;
  coachOptions: Array<{ id: string; name?: string | null; email: string }>;
  isCoachOptionsLoading: boolean;
  coachOptionsError: string | null;
  deletingClientId: string | null;
  isSaving: boolean;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (clientId: string) => void;
}

interface AutoSendProps {
  enabled: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}

interface ReportSectionProps {
  reports: Report[];
  isLoading: boolean;
  isGenerating: boolean;
  disabled: boolean;
  error: string | null;
  onGenerate: () => void;
  onOpen: (report: Report) => void;
}

interface DocumentProps {
  documents: ClientDocument[];
  isUploading: boolean;
  onUpload: () => void;
}

export interface ClientDetailsPanelProps {
  variant: "desktop" | "mobile";
  channelProps: ChannelProps;
  clientProps: ClientSummaryProps;
  editClientProps: EditClientProps;
  autoSendProps: AutoSendProps;
  reportProps: ReportSectionProps;
  documentProps: DocumentProps;
}

export function ClientDetailsPanel({
  variant,
  channelProps,
  clientProps,
  editClientProps,
  autoSendProps,
  reportProps,
  documentProps,
}: ClientDetailsPanelProps) {
  const { activeChannel, canUseSupervisorChannel, onChannelChange } =
    channelProps;
  const {
    selectedClient,
    selectedClientInitials,
    selectedClientSummary,
    focusTags,
    strengthsAndWatchouts,
    summaryRef,
    isSummaryExpanded,
    summaryCanExpand,
    onToggleSummaryExpanded,
  } = clientProps;
  const {
    canEdit,
    isDialogOpen,
    onOpenChange,
    onTriggerClick,
    clientForm,
    setClientForm,
    avatarFile,
    setAvatarFile,
    avatarInputId,
    isAdmin,
    coachOptions,
    isCoachOptionsLoading,
    coachOptionsError,
    deletingClientId,
    isSaving,
    onSave,
    onDelete,
  } = editClientProps;
  const { enabled: autoSendEnabled, disabled: autoSendDisabled, onChange: onAutoSendChange } =
    autoSendProps;
  const { documents, isUploading, onUpload } = documentProps;

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
          onClick={() => onChannelChange("coach")}
          className={`rounded-full z-20 px-4 py-1.5 transition ${
            activeChannel === "coach"
              ? "bg-white text-slate-900 shadow"
              : "hover:text-slate-900"
          }`}
        >
          Coach assistent
        </button>
        {canUseSupervisorChannel && (
          <button
            onClick={() => onChannelChange("meta")}
            className={`rounded-full px-4 py-1.5 transition ${
              activeChannel === "meta"
                ? "bg-white text-slate-900 shadow"
                : "hover:text-slate-900"
            }`}
          >
            Overzichtscoach
          </button>
        )}
      </div>
      <div className={bodyClasses}>
        <div className="rounded-3xl bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2ea3f2] text-white">
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
                {selectedClient?.name ?? "Geen Coachee"}
              </p>
              <p className="text-[11px] text-slate-500">
                {selectedClient?.focusArea || "Geen focus"}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <p
              ref={summaryRef}
              className={`text-[13px] leading-relaxed text-slate-600 ${
                !isSummaryExpanded ? "line-clamp-3" : ""
              }`}
            >
              {selectedClientSummary}
            </p>
            {summaryCanExpand && (
              <button
                type="button"
                aria-expanded={isSummaryExpanded}
                onClick={onToggleSummaryExpanded}
                className="mt-1 text-[12px] font-medium text-[#2ea3f2] transition hover:text-[#2386c9]"
              >
                {isSummaryExpanded ? "Lees minder" : "Lees meer"}
              </button>
            )}
          </div>
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
          {canEdit && selectedClient && (
            <Dialog open={isDialogOpen} onOpenChange={onOpenChange}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  onClick={onTriggerClick}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit2 className="size-3.5" />
                  Bewerk Coachee
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl space-y-4">
                <DialogHeader>
                  <DialogTitle>Bewerk Coachee</DialogTitle>
                  <DialogDescription>
                    Werk gegevens bij voor {selectedClient.name}.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={onSave}>
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
                        id={avatarInputId}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) =>
                          setAvatarFile(event.target.files?.[0] ?? null)
                        }
                      />
                      <label
                        htmlFor={avatarInputId}
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
                    Leidinggevende
                    <input
                      type="text"
                      value={clientForm.managerName}
                      onChange={(event) =>
                        setClientForm((form) => ({
                          ...form,
                          managerName: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                      placeholder="Naam leidinggevende"
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
                  {isAdmin ? (
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
                  ) : null}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => onDelete(selectedClient.id)}
                      disabled={deletingClientId === selectedClient.id}
                      className="rounded-lg border border-rose-200 px-4 py-2 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {deletingClientId === selectedClient.id
                        ? "Verwijderen..."
                        : "Verwijder coachee"}
                    </button>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
                      >
                        Annuleren
                      </button>
                      <button
                        type="submit"
                        disabled={
                          isSaving || deletingClientId === selectedClient.id
                        }
                        className="rounded-lg bg-[#2ea3f2] px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        {isSaving ? "Opslaan..." : "Opslaan"}
                      </button>
                    </div>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="rounded-3xl bg-white p-4 space-y-0 flex items-center justify-center w-full">
          <label className="inline-flex items-center w-full gap-2 pl-1 text-[11px] text-slate-500">
            <Switch
              checked={autoSendEnabled}
              onCheckedChange={onAutoSendChange}
              disabled={autoSendDisabled}
              aria-label="Auto-send after transcription"
            />
            <span>Verzend na transcriptie</span>
          </label>
        </div>
        <ReportPanel
          reports={reportProps.reports}
          isLoading={reportProps.isLoading}
          isGenerating={reportProps.isGenerating}
          disabled={reportProps.disabled}
          error={reportProps.error}
          onGenerate={reportProps.onGenerate}
          onOpen={reportProps.onOpen}
        />

        <div className="rounded-3xl bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold mb-0.5 tracking-wide text-slate-700">
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
              onClick={onUpload}
              disabled={isUploading}
              className="rounded-full bg-[#2ea3f2] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              {isUploading ? "Uploaden..." : "Upload"}
            </button>
          </div>

          {documents.length === 0 ? null : null}
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
}
