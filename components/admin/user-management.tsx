"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  ClipboardCopy,
  Shield,
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
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
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

  async function handleRoleChange(userId: string, nextRole: AdminUser["role"]) {
    const target = users.find((entry) => entry.id === userId);
    if (!target || target.role === nextRole) {
      return;
    }

    setUpdatingUserId(userId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
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

  function closeInviteDialog() {
    setInviteDialogOpen(false);
    setInviteEmail("");
    setInviteLink(null);
    setCreatingInvite(false);
  }

  return (
    <div className="p-4 h-full">
      <div className="flex h-full rounded-3xl flex-col pt-4 bg-white">
        <header className="relative z-10 flex rounded-t-3xl pt-4 shrink-0 items-center justify-between border-b border-white/30 px-8 backdrop-blur-xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Administratie
            </p>
            <h1 className="text-lg font-semibold text-slate-900">
              Gebruikersbeheer
            </h1>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Terug naar dashboard
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-[#f1f1f1] p-2">
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg">
                <div className="rounded-full bg-[#F3CDFE] p-3 text-slate-900">
                  <Users className="size-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Coaches
                  </p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {isLoading ? "…" : coachCount}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-[#f1f1f1] p-2">
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg">
                <div className="rounded-full bg-[#FDEDD3] p-3 text-slate-900">
                  <Shield className="size-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Admins
                  </p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {isLoading ? "…" : adminCount}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-[#f1f1f1] p-2">
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg">
                <div className="rounded-full bg-[#B4D1EF] p-3 text-slate-900">
                  <UserPlus className="size-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Openstaande uitnodigingen
                  </p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {isLoading ? "…" : invites.length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-col bg-[#f1f1f1] p-4 rounded-3xl">
            <div className="flex items-center w-full justify-between px-2.5">
              <div className="">
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
                className="inline-flex items-center gap-2 rounded-lg bg-[#222222] px-4 py-2 text-sm text-white hover:bg-slate-800"
              >
                <UserPlus className="size-4" />
                Uitnodigen
              </button>
            </div>
            <div className="w-full rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">
                Verstuurde uitnodigingen
              </p>
              <p className="text-xs text-slate-500">
                Deel de link met de coach om een account te laten aanmaken.
              </p>
              <ul className="mt-4 space-y-3">
                {invites.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-slate-200 bg-[#f1f1f1] px-4 py-6 text-center text-sm text-slate-500">
                    Geen openstaande uitnodigingen.
                  </li>
                ) : (
                  invites.map((invite) => (
                    <li
                      key={invite.id}
                      className="rounded-xl border border-slate-100 bg-[#F1f1f1] p-3 text-sm"
                    >
                      <p className="font-medium text-slate-900">
                        {invite.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        Verloopt op{" "}
                        {new Date(invite.expiresAt).toLocaleDateString(
                          "nl-NL",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyLink(invite.inviteUrl, invite.token)
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {copiedToken === invite.token ? (
                            <>
                              <ClipboardCheck className="size-3.5" />
                              Gekopieerd
                            </>
                          ) : (
                            <>
                              <ClipboardCopy className="size-3.5" />
                              Kopieer link
                            </>
                          )}
                        </button>
                      </div>
                      {invite.createdByName && (
                        <p className="mt-1 text-xs text-slate-500">
                          Door {invite.createdByName}
                        </p>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-4">
              <div className=" overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Naam</th>
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Rol</th>
                      <th className="px-3 py-2">Aangemaakt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          Gebruikers worden geladen...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          Nog geen gebruikers gevonden.
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => {
                        const isRowUpdating = updatingUserId === user.id;
                        const initials = getInitials(user.name, user.email);
                        return (
                          <tr key={user.id}>
                            <td className="px-3 py-2 text-slate-900">
                              <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200 flex items-center justify-center overflow-hidden">
                                  {user.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={user.image}
                                      alt={user.name}
                                      className="size-10 object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs font-semibold">
                                      {initials ||
                                        user.email.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <span className="font-semibold">
                                  {user.name || "Onbekend"}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {user.email}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={user.role}
                                onChange={(event) =>
                                  handleRoleChange(
                                    user.id,
                                    event.target.value as AdminUser["role"]
                                  )
                                }
                                disabled={isRowUpdating}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 focus:border-slate-900 focus:outline-none disabled:opacity-60"
                                aria-label="Wijzig rol"
                              >
                                {roleOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {new Date(user.createdAt).toLocaleDateString(
                                "nl-NL",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nodig een coach uit</DialogTitle>
              <DialogDescription>
                De ontvanger ontvangt een link om een account aan te maken.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                E-mailadres
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                  placeholder="coach@example.com"
                  required
                />
              </label>
              {inviteLink && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <p className="font-semibold">Uitnodiging aangemaakt</p>
                  <p className="break-all text-xs">{inviteLink}</p>
                  <button
                    type="button"
                    onClick={() => handleCopyLink(inviteLink, inviteLink)}
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-white"
                  >
                    <ClipboardCopy className="size-3.5" />
                    Kopieer link
                  </button>
                </div>
              )}
              <div className="flex justify-end gap-2 text-sm">
                <button
                  type="button"
                  onClick={closeInviteDialog}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={isCreatingInvite}
                  className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isCreatingInvite ? "Versturen..." : "Uitnodigen"}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
