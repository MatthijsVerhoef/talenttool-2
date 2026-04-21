"use client";

import Image from "next/image";
import {
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ProfileForm, type UserForm } from "@/components/settings/profile-form";
import type { ClientProfile } from "@/lib/data/clients";

export type { UserForm };

export type SettingsTab = "profile" | "preferences" | "prompts";
export type ActiveSidebarTab =
  | "dashboard"
  | "prompt-center"
  | "user-management";

export interface NewClientForm {
  name: string;
  managerName: string;
  focusArea: string;
  summary: string;
  goals: string;
  coachId: string;
}

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

const toolLinks: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Instellingen", icon: Settings },
];

interface SettingsSectionItem {
  id: SettingsTab;
  label: string;
  title: string;
  description: string;
}

interface DisplayUser {
  name: string;
  email: string;
  image?: string | null;
}

export interface SidebarUserProps {
  name: string;
  image: string | null | undefined;
  companyName: string | null | undefined;
  companyLogoUrl: string | null | undefined;
  userInitial: string;
}

export interface SidebarClientListProps {
  clients: ClientProfile[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
}

export interface SidebarCreateClientProps {
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  form: NewClientForm;
  setForm: (updater: (prev: NewClientForm) => NewClientForm) => void;
  avatarFile: File | null;
  setAvatarFile: (file: File | null) => void;
  avatarInputId: string;
  initials: string;
  coachOptions: Array<{ id: string; name?: string | null; email: string }>;
  isCoachOptionsLoading: boolean;
  coachOptionsError: string | null;
  isCreating: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export interface SidebarNavigationProps {
  activeTab: ActiveSidebarTab;
  onNavigate: (tab: ActiveSidebarTab) => void;
  isAdmin: boolean;
}

export interface SidebarSettingsProps {
  sections: SettingsSectionItem[];
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  activeSection: SettingsSectionItem | undefined;
  displayUser: DisplayUser;
  userForm: UserForm;
  setUserForm: (updater: (form: UserForm) => UserForm) => void;
  userAvatarFile: File | null;
  setUserAvatarFile: (file: File | null) => void;
  companyLogoFile: File | null;
  setCompanyLogoFile: (file: File | null) => void;
  isUserSaving: boolean;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  userAvatarInputId: string;
  companyLogoInputId: string;
  autoSendAfterTranscription: boolean;
  onAutoSendChange: (value: boolean) => void;
}

export interface SidebarFooterProps {
  isSigningOut: boolean;
  onSignOut: () => void;
}

export interface DashboardSidebarProps {
  showSidebar: boolean;
  isAdmin: boolean;
  userProps: SidebarUserProps;
  clientListProps: SidebarClientListProps;
  createClientProps: SidebarCreateClientProps;
  navigationProps: SidebarNavigationProps;
  settingsProps: SidebarSettingsProps;
  footerProps: SidebarFooterProps;
}

export function DashboardSidebar({
  showSidebar,
  isAdmin,
  userProps,
  clientListProps,
  createClientProps,
  navigationProps,
  settingsProps,
  footerProps,
}: DashboardSidebarProps) {
  const { name, image, companyName, companyLogoUrl, userInitial } = userProps;
  const { clients, selectedClientId, onSelect } = clientListProps;
  const {
    isDialogOpen: isCreateDialogOpen,
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
    isCreating,
    onSubmit: handleNewClientSubmit,
  } = createClientProps;
  const {
    activeTab: activeSidebarTab,
    onNavigate,
    isAdmin: navIsAdmin,
  } = navigationProps;
  const {
    sections: settingsSections,
    activeTab: activeSettingsTab,
    onTabChange: setActiveSettingsTab,
    activeSection: activeSettings,
    displayUser,
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
    autoSendAfterTranscription,
    onAutoSendChange,
  } = settingsProps;
  const { isSigningOut, onSignOut: handleSignOut } = footerProps;

  return (
    <aside
      className={[
        "pt-7 px-1.5 w-full lg:w-72 shrink-0 flex-col lg:flex lg:relative lg:shadow-none lg:bg-transparent bg-white",
        showSidebar ? "flex" : "hidden lg:flex",
        "h-full lg:h-auto overflow-y-auto lg:overflow-visible",
      ].join(" ")}
    >
      {/* Header */}
      <div className="">
        <div className="space-y-3 px-3">
          {(companyName || companyLogoUrl) && (
            <div className="flex items-center">
              <div className="size-7 shrink-0 overflow-hidden bg-transparent flex items-center justify-center">
                {companyLogoUrl ? (
                  <Image
                    src={companyLogoUrl}
                    alt={companyName ?? "Bedrijfslogo"}
                    width={40}
                    height={40}
                    className="size-4.5 object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold">
                    {getInitials(companyName) || "B"}
                  </span>
                )}
              </div>
              <div className="min-w-0 ml-1.5 leading-tight">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {companyName}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0 rounded-full bg-[#2ea3f2] text-white overflow-hidden ring-1 ring-slate-900/10">
              {image ? (
                <Image
                  src={image}
                  alt={name}
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
                {name}
              </p>
              <p className="text-xs text-slate-500">
                {isAdmin ? "Administrator" : "Coach"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto pl-2 pr-1 py-4 space-y-4">
        {/* Clients */}
        <div>
          <div className="mb-2 flex items-center justify-between pl-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#242424]">
              coachees
            </p>
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={onCreateDialogOpenChange}
            >
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-100/70">
                  <Plus className="size-3.5" />
                  Nieuw
                </button>
              </DialogTrigger>
              <DialogContent className="w-3xl lg:min-w-3xl max-w-screen p-4 lg:p-8 rounded-3xl space-y-4">
                <DialogHeader>
                  <DialogTitle>Nieuwe Coachee</DialogTitle>
                  <DialogDescription>
                    Voeg een nieuwe coachee toe aan het systeem.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleNewClientSubmit}>
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
                      placeholder="Bijv. Sophie van Dijk"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    Leidinggevende
                    <input
                      type="text"
                      value={newClientForm.managerName}
                      onChange={(event) =>
                        setNewClientForm((form) => ({
                          ...form,
                          managerName: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
                      placeholder="Bijv. Mark Jansen"
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
                      placeholder="Bijv. Leiderschap en communicatie"
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
                      placeholder="Korte omschrijving van de situatie, achtergrond of hulpvraag"
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

                  {isAdmin ? (
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
                            ? "Nodig coaches uit om coachees toe te wijzen."
                            : "Deze coach krijgt toegang tot dit dossier."}
                        </span>
                      )}
                    </label>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Deze Coachee wordt automatisch aan jouw coachaccount
                      gekoppeld.
                    </div>
                  )}

                  <div className="flex justify-end gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => onCreateDialogOpenChange(false)}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="rounded-lg bg-[#2ea3f2] px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      {isCreating ? "Opslaan..." : "Opslaan"}
                    </button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <ul className="space-y-0.5">
            {clients.map((client) => {
              const isActive = client.id === selectedClientId;
              return (
                <li key={client.id}>
                  <button
                    onClick={() => onSelect(client.id)}
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
            {navIsAdmin && (
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("user-management")}
                  className={[
                    "w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                    activeSidebarTab === "user-management"
                      ? "bg-[#2ea3f2]/10 text-slate-900"
                      : "text-slate-900 hover:bg-slate-100/70",
                  ].join(" ")}
                >
                  <ShieldCheck className="size-4 text-slate-900" />
                  Gebruikersbeheer
                </button>
              </li>
            )}
            {navIsAdmin && (
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("prompt-center")}
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
                        <div className="flex h-[520px] max-h-[85vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:flex-row">
                          <div className="w-full border-b border-slate-100 bg-slate-50 p-4 md:w-[200px] md:border-b-0 md:border-r md:p-5">
                            <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Instellingen
                            </p>
                            <div className="flex flex-row flex-wrap gap-1 md:flex-col md:flex-nowrap">
                              {settingsSections.map((section) => {
                                const isSectionActive =
                                  section.id === activeSettingsTab;
                                return (
                                  <button
                                    key={section.id}
                                    type="button"
                                    onClick={() =>
                                      setActiveSettingsTab(section.id)
                                    }
                                    className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                                      isSectionActive
                                        ? "bg-[#2ea3f2]/10 text-[#2ea3f2]"
                                        : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-900"
                                    }`}
                                  >
                                    {section.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex flex-1 flex-col bg-white">
                            <div className="border-b border-slate-100 px-6 py-5">
                              <DialogTitle className="text-base font-semibold text-slate-900">
                                {activeSettings?.title}
                              </DialogTitle>
                              {activeSettings?.description && (
                                <DialogDescription className="mt-0.5 text-sm text-slate-500">
                                  {activeSettings.description}
                                </DialogDescription>
                              )}
                            </div>
                            <div className="flex-1 overflow-y-auto p-6">
                              {activeSettingsTab === "profile" && (
                                <ProfileForm
                                  displayUser={displayUser}
                                  userForm={userForm}
                                  setUserForm={setUserForm}
                                  userAvatarFile={userAvatarFile}
                                  setUserAvatarFile={setUserAvatarFile}
                                  companyLogoFile={companyLogoFile}
                                  setCompanyLogoFile={setCompanyLogoFile}
                                  isAdmin={isAdmin}
                                  isUserSaving={isUserSaving}
                                  onSubmit={handleUserSave}
                                  userAvatarInputId={userAvatarInputId}
                                  companyLogoInputId={companyLogoInputId}
                                />
                              )}
                              {activeSettingsTab === "preferences" && (
                                <div className="space-y-4">
                                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900">
                                        Automatisch verzenden na spraakopname
                                      </p>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        Wanneer ingeschakeld wordt een ingesproken bericht direct verstuurd zodra de transcriptie klaar is. Schakel uit om de tekst eerst te controleren.
                                      </p>
                                    </div>
                                    <Switch
                                      checked={autoSendAfterTranscription}
                                      onCheckedChange={onAutoSendChange}
                                      aria-label="Automatisch verzenden na spraakopname"
                                      className="mt-0.5 shrink-0"
                                    />
                                  </div>
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

      {/* Footer */}
      <div className="p-3">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100/70 disabled:opacity-50"
        >
          <LogOut className="size-4 text-slate-400" />
          Uitloggen
        </button>
      </div>
    </aside>
  );
}
