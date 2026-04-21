"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import type { ClientProfile } from "@/lib/data/clients";

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
}

interface UseClientManagerOptions {
  selectedClientId: string | null;
  selectedClient: ClientProfile | null | undefined;
  isAdmin: boolean;
  clientList: ClientProfile[];
  onError: (message: string | null) => void;
  onClientSaved: (client: ClientProfile) => void;
  onClientCreated: (client: ClientProfile) => void;
  onClientDeleted: (clientId: string, nextSelectedId: string | null) => void;
  onRefresh: () => void;
}

export function useClientManager({
  selectedClientId,
  selectedClient,
  isAdmin,
  clientList,
  onError,
  onClientSaved,
  onClientCreated,
  onClientDeleted,
  onRefresh,
}: UseClientManagerOptions) {
  const editClientAvatarInputId = useId();
  const newClientAvatarInputId = useId();

  const [isClientDialogOpen, setClientDialogOpen] = useState(false);
  const [isCreateClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [isClientSaving, setClientSaving] = useState(false);
  const [isCreatingClient, setCreatingClient] = useState(false);

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
  const [newClientAvatarFile, setNewClientAvatarFile] = useState<File | null>(null);

  const newClientInitials = getInitials(newClientForm.name);

  // ── Effects ───────────────────────────────────────────────────────────────

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

  // ── Dialog helpers ────────────────────────────────────────────────────────

  function openEditDialog(client: ClientProfile) {
    setEditingClientId(client.id);
    setAvatarFile(null);
    setClientForm({
      name: client.name,
      managerName: client.managerName ?? "",
      focusArea: client.focusArea,
      summary: client.summary,
      goals: client.goals.join(", "),
      avatarUrl: client.avatarUrl ?? "",
      coachId: client.coachId ?? "",
    });
  }

  function onEditDialogOpenChange(open: boolean) {
    setClientDialogOpen(open);
    if (!open) {
      setAvatarFile(null);
      setEditingClientId(null);
    }
  }

  function onCreateDialogOpenChange(open: boolean) {
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
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleClientSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientId = editingClientId ?? selectedClientId;
    if (!clientId) return;

    setClientSaving(true);
    onError(null);
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
          ...(isAdmin ? { coachId: clientForm.coachId ? clientForm.coachId : null } : {}),
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
          body: JSON.stringify({ clientId, avatarUrl: uploadData.url }),
        });
        const avatarResult = await avatarPatch.json();
        if (!avatarPatch.ok) {
          throw new Error(avatarResult.error ?? "Bijwerken van cliëntavatar is mislukt.");
        }
        latestClient = avatarResult.client ?? latestClient;
      }

      if (latestClient) {
        onClientSaved(latestClient);
      }

      onRefresh();
      setClientDialogOpen(false);
      setAvatarFile(null);
      setEditingClientId(null);
    } catch (updateError) {
      console.error(updateError);
      onError((updateError as Error).message ?? "Bijwerken van Coachee is mislukt.");
    } finally {
      setClientSaving(false);
    }
  }

  async function handleNewClientSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newClientForm.name.trim()) {
      onError("Naam is verplicht.");
      return;
    }

    setCreatingClient(true);
    onError(null);
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
          ...(isAdmin ? { coachId: newClientForm.coachId ? newClientForm.coachId : null } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Coachee aanmaken is mislukt.");
      }

      onRefresh();
      if (data.client?.id) {
        onClientCreated(data.client as ClientProfile);
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
      onError(
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
    if (!client || deletingClientId === clientId) return;

    const confirmed = window.confirm(
      `Weet je zeker dat je ${client.name} wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
    );
    if (!confirmed) return;

    setDeletingClientId(clientId);
    onError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Coachee verwijderen is mislukt.");
      }

      const nextSelectedId =
        selectedClientId === clientId
          ? (clientList.find((entry) => entry.id !== clientId)?.id ?? null)
          : selectedClientId;

      onClientDeleted(clientId, nextSelectedId);
      setClientDialogOpen(false);
      setEditingClientId(null);
      setAvatarFile(null);
      toast.success("Coachee verwijderd.");
      onRefresh();
    } catch (deleteError) {
      console.error(deleteError);
      onError(
        deleteError instanceof Error
          ? deleteError.message
          : "Coachee verwijderen is mislukt."
      );
    } finally {
      setDeletingClientId((current) => (current === clientId ? null : current));
    }
  }

  return {
    // IDs
    editClientAvatarInputId,
    newClientAvatarInputId,
    // Edit dialog
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
    // Create dialog
    isCreateClientDialogOpen,
    newClientForm,
    setNewClientForm,
    newClientAvatarFile,
    setNewClientAvatarFile,
    newClientInitials,
    isCreatingClient,
    onCreateDialogOpenChange,
    handleNewClientSubmit,
    // Delete
    deletingClientId,
    handleClientDelete,
  };
}
