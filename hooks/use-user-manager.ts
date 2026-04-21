"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@prisma/client";

import { signOutUser } from "@/lib/auth-client";
import { joinUserName, splitUserName } from "@/lib/user-name";

type CurrentUser = {
  name: string;
  email: string;
  image?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  role: UserRole;
};

async function clearClientStateAfterSignOut() {
  if (typeof window === "undefined") return;
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

interface UseUserManagerOptions {
  currentUser: CurrentUser;
  onError: (message: string | null) => void;
}

export function useUserManager({ currentUser, onError }: UseUserManagerOptions) {
  const router = useRouter();
  const userAvatarInputId = useId();
  const companyLogoInputId = useId();

  const initialUserName = splitUserName(currentUser.name);
  const [displayUser, setDisplayUser] = useState(currentUser);
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
  const [isSigningOut, setSigningOut] = useState(false);

  const normalizedUserRole =
    typeof displayUser.role === "string"
      ? displayUser.role.trim().toUpperCase()
      : "";
  const isAdmin = normalizedUserRole === "ADMIN";
  const canEditClients = isAdmin || normalizedUserRole === "COACH";
  const canUseSupervisorChannel =
    normalizedUserRole === "ADMIN" || normalizedUserRole === "COACH";
  const userInitial = displayUser.name?.charAt(0).toUpperCase() ?? "C";

  // ── Effects ───────────────────────────────────────────────────────────────

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

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleUserSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserSaving(true);
    onError(null);
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
          throw new Error(uploadData.error ?? "Bedrijfslogo uploaden is mislukt.");
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
      onError((userError as Error).message ?? "Profiel bijwerken is mislukt.");
    } finally {
      setUserSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    onError(null);
    try {
      await signOutUser();
      await clearClientStateAfterSignOut();
      window.location.replace("/login");
      return;
    } catch (signOutError) {
      console.error(signOutError);
      onError(
        signOutError instanceof Error
          ? signOutError.message
          : "Uitloggen is niet gelukt."
      );
    } finally {
      setSigningOut(false);
    }
  }

  return {
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
  };
}
