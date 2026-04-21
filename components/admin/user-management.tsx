"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  ClipboardCopy,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COACH";
  createdAt: string;
  image?: string | null;
};

type PendingInvite = {
  id: string;
  email: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  inviteUrl: string;
  createdByName?: string | null;
};

interface AdminUserManagementProps {
  onBack: () => void;
}

const roleOptions: Array<{ value: AdminUser["role"]; label: string }> = [
  { value: "COACH", label: "Coach" },
  { value: "ADMIN", label: "Admin" },
];

function getInitials(name?: string, email?: string) {
  const source = name?.trim() || email?.trim();
  if (!source) return "";
  const parts = source.split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

export function AdminUserManagement({ onBack }: AdminUserManagementProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCreatingInvite, setCreatingInvite] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const coachCount = useMemo(
    () => users.filter((user) => user.role === "COACH").length,
    [users]
  );
  const adminCount = useMemo(
    () => users.filter((user) => user.role === "ADMIN").length,
    [users]
  );

  useEffect(() => {
    void fetchOverview();
  }, []);

  async function fetchOverview() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Kon gebruikers niet ophalen.");
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
      setInvites(Array.isArray(data.invites) ? data.invites : []);
      setCurrentUserId(
        typeof data.currentUserId === "string" ? data.currentUserId : null
      );
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Kon gebruikers niet ophalen.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      setError("E-mailadres is verplicht.");
      return;
    }

    setCreatingInvite(true);
    setError(null);
    setInviteLink(null);
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof data.inviteUrl === "string" && data.inviteUrl.length > 0) {
          setInviteLink(data.inviteUrl);
        }
        throw new Error(
          data.error ?? "Het versturen van de uitnodiging is mislukt."
        );
      }
      setInviteLink(data.inviteUrl ?? null);
      setInviteEmail("");
      await fetchOverview();
    } catch (inviteError) {
      const message =
        inviteError instanceof Error
          ? inviteError.message
          : "Het versturen van de uitnodiging is mislukt.";
      setError(message);
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleCopyLink(link: string, token: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToken(token);
      setTimeout(() => {
        setCopiedToken((current) => (current === token ? null : current));
      }, 2000);
    } catch {
      setError("Kopiëren naar het klembord is mislukt.");
    }
  }

  async function handleInviteRevoke(inviteId: string) {
    if (!inviteId || revokingInviteId === inviteId) return;

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "Weet je zeker dat je deze uitnodiging wilt intrekken?"
          );

    if (!confirmed) return;

    setRevokingInviteId(inviteId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/invitations/${inviteId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Uitnodiging intrekken is mislukt.");
      }
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
    } catch (revokeError) {
      const message =
        revokeError instanceof Error
          ? revokeError.message
          : "Uitnodiging intrekken is mislukt.";
      setError(message);
    } finally {
      setRevokingInviteId((current) => (current === inviteId ? null : current));
    }
  }

  async function handleRoleChange(userId: string, nextRole: AdminUser["role"]) {
    const target = users.find((entry) => entry.id === userId);
    if (!target || target.role === nextRole) return;

    setUpdatingUserId(userId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Rol bijwerken is mislukt.");
      }

      const updatedUser = data.user as AdminUser | undefined;
      if (updatedUser) {
        setUsers((prev) =>
          prev.map((user) => (user.id === userId ? updatedUser : user))
        );
      } else {
        await fetchOverview();
      }
    } catch (updateError) {
      const message =
        updateError instanceof Error
          ? updateError.message
          : "Rol bijwerken is mislukt.";
      setError(message);
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleUserDelete(userId: string) {
    const target = users.find((entry) => entry.id === userId);
    if (!target || deletingUserId === userId) return;

    if (currentUserId === userId) {
      setError("Je kunt je eigen account niet verwijderen.");
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je ${target.name || target.email} wilt verwijderen?`
    );
    if (!confirmed) return;

    setDeletingUserId(userId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Gebruiker verwijderen is mislukt.");
      }
      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Gebruiker verwijderen is mislukt.";
      setError(message);
    } finally {
      setDeletingUserId((current) => (current === userId ? null : current));
    }
  }

  function closeInviteDialog() {
    setInviteDialogOpen(false);
    setInviteEmail("");
    setInviteLink(null);
    setCreatingInvite(false);
  }

  return (
    <div className="p-0 md:p-2 flex-1 min-h-0 overflow-hidden">
      <div className="relative flex h-full min-h-0 flex-col rounded-none md:rounded-[36px] overflow-hidden bg-white/25 backdrop-blur-2xl backdrop-saturate-120">
        {/* Border overlay */}
        <div className="pointer-events-none absolute inset-0 md:rounded-[36px] border border-white z-10" />
        {/* Top highlight */}
        <div className="pointer-events-none absolute inset-0 md:rounded-[36px] bg-gradient-to-b from-white/45 via-white/18 to-transparent z-10" />

        {/* Content */}
        <div className="relative z-20 flex flex-col h-full min-h-0">
          {/* Header */}
          <header className="flex shrink-0 items-center justify-between px-6 pt-7 pb-4 lg:p-12 lg:pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Administratie
              </p>
              <h1 className="text-lg font-semibold text-slate-900">
                Gebruikersbeheer
              </h1>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center rounded-full border border-white/60 bg-white/40 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-white/60 transition"
            >
              Terug
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 pb-6 lg:px-10 lg:pb-6 space-y-4">
            {error && (
              <div className="rounded-2xl border border-rose-200/60 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {/* Stats */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-white/60 border border-white/60 p-4 flex items-center gap-3">
                <div className="rounded-full bg-[#F3CDFE]/60 p-3 shrink-0">
                  <Users className="size-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Coaches
                  </p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {isLoading ? "…" : coachCount}
                  </p>
                </div>
              </div>
              <div className="rounded-3xl bg-white/60 border border-white/60 p-4 flex items-center gap-3">
                <div className="rounded-full bg-[#FDEDD3]/80 p-3 shrink-0">
                  <Shield className="size-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Admins
                  </p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {isLoading ? "…" : adminCount}
                  </p>
                </div>
              </div>
              <div className="rounded-3xl bg-white/60 border border-white/60 p-4 flex items-center gap-3">
                <div className="rounded-full bg-[#B4D1EF]/60 p-3 shrink-0">
                  <UserPlus className="size-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Uitnodigingen
                  </p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {isLoading ? "…" : invites.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Active users */}
            <div className="rounded-3xl bg-white/60 border border-white/60 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/50">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Actieve gebruikers
                  </p>
                  <p className="text-xs text-slate-500">
                    Overzicht van alle coaches en admins.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInviteDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-[#2ea3f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b8fd9] transition"
                >
                  <UserPlus className="size-4" />
                  Uitnodigen
                </button>
              </div>

              {isLoading ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Gebruikers worden geladen...
                </p>
              ) : users.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Nog geen gebruikers gevonden.
                </p>
              ) : (
                <ul className="divide-y divide-white/50">
                  {users.map((user) => {
                    const isRowUpdating = updatingUserId === user.id;
                    const isRowDeleting = deletingUserId === user.id;
                    const isCurrentUser = currentUserId === user.id;
                    const isRowBusy = isRowUpdating || isRowDeleting;
                    const initials = getInitials(user.name, user.email);
                    return (
                      <li
                        key={user.id}
                        className="flex items-center gap-4 px-5 py-3"
                      >
                        {/* Avatar */}
                        <div className="size-9 shrink-0 rounded-full bg-[#2ea3f2] text-white ring-1 ring-slate-200/50 flex items-center justify-center overflow-hidden">
                          {user.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={user.image}
                              alt={user.name}
                              className="size-9 object-cover"
                            />
                          ) : (
                            <span className="text-xs font-semibold">
                              {initials || user.email.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Name / email */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {user.name || "Onbekend"}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {user.email}
                          </p>
                        </div>

                        {/* Role select */}
                        <select
                          value={user.role}
                          onChange={(event) =>
                            handleRoleChange(
                              user.id,
                              event.target.value as AdminUser["role"]
                            )
                          }
                          disabled={isRowBusy}
                          aria-label="Wijzig rol"
                          className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 focus:border-[#2ea3f2] focus:outline-none disabled:opacity-60"
                        >
                          {roleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        {/* Joined */}
                        <span className="hidden sm:block shrink-0 text-xs text-slate-400 tabular-nums">
                          {new Date(user.createdAt).toLocaleDateString(
                            "nl-NL",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </span>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleUserDelete(user.id)}
                          disabled={isRowDeleting || isCurrentUser}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200/70 bg-white/50 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          {isCurrentUser
                            ? "Eigen account"
                            : isRowDeleting
                            ? "Verwijderen..."
                            : "Verwijder"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Pending invites */}
            <div className="rounded-3xl bg-white/60 border border-white/60 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/50">
                <p className="text-sm font-semibold text-slate-900">
                  Verstuurde uitnodigingen
                </p>
                <p className="text-xs text-slate-500">
                  Deel de link met de coach om een account aan te maken.
                </p>
              </div>
              {invites.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Geen openstaande uitnodigingen.
                </p>
              ) : (
                <ul className="divide-y divide-white/50">
                  {invites.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex items-center gap-4 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {invite.email}
                        </p>
                        <p className="text-xs text-slate-400">
                          Verloopt op{" "}
                          {new Date(invite.expiresAt).toLocaleDateString(
                            "nl-NL",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                          {invite.createdByName &&
                            ` · Door ${invite.createdByName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyLink(invite.inviteUrl, invite.token)
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-white transition"
                        >
                          {copiedToken === invite.token ? (
                            <>
                              <ClipboardCheck className="size-3.5 text-emerald-600" />
                              Gekopieerd
                            </>
                          ) : (
                            <>
                              <ClipboardCopy className="size-3.5" />
                              Kopieer link
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInviteRevoke(invite.id)}
                          disabled={revokingInviteId === invite.id}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200/70 bg-white/70 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition disabled:opacity-50"
                        >
                          {revokingInviteId === invite.id
                            ? "Intrekken..."
                            : "Intrekken"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Invite dialog */}
          <Dialog
            open={isInviteDialogOpen}
            onOpenChange={(open) => {
              setInviteDialogOpen(open);
              if (!open) {
                setInviteEmail("");
                setInviteLink(null);
                setCreatingInvite(false);
              }
            }}
          >
            <DialogContent className="rounded-3xl p-6 max-w-md">
              <DialogHeader>
                <DialogTitle>Nodig een coach uit</DialogTitle>
                <DialogDescription>
                  De ontvanger ontvangt een link om een account aan te maken.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInviteSubmit} className="space-y-4 mt-2">
                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  E-mailadres
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-[#2ea3f2] focus:outline-none"
                    placeholder="coach@example.com"
                    required
                  />
                </label>
                {inviteLink && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <p className="font-semibold">Uitnodiging aangemaakt</p>
                    <p className="mt-0.5 break-all text-xs text-emerald-700">
                      {inviteLink}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(inviteLink, inviteLink)}
                      className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-white/70 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition"
                    >
                      <ClipboardCopy className="size-3.5" />
                      Kopieer link
                    </button>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeInviteDialog}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingInvite}
                    className="rounded-full bg-[#2ea3f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1b8fd9] transition disabled:opacity-50"
                  >
                    {isCreatingInvite ? "Versturen..." : "Uitnodigen"}
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
