"use client";

import Image from "next/image";
import { Building2, ImagePlus, UserRound } from "lucide-react";

function getInitials(name?: string | null) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return (first + last).toUpperCase();
}

interface DisplayUser {
  name: string;
  email: string;
  image?: string | null;
}

export interface UserForm {
  firstName: string;
  lastName: string;
  image: string;
  companyName: string;
  companyLogoUrl: string;
}

interface ProfileFormProps {
  displayUser: DisplayUser;
  userForm: UserForm;
  setUserForm: (updater: (form: UserForm) => UserForm) => void;
  userAvatarFile: File | null;
  setUserAvatarFile: (file: File | null) => void;
  companyLogoFile: File | null;
  setCompanyLogoFile: (file: File | null) => void;
  isAdmin: boolean;
  isUserSaving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  userAvatarInputId: string;
  companyLogoInputId: string;
}

export function ProfileForm({
  displayUser,
  userForm,
  setUserForm,
  userAvatarFile,
  setUserAvatarFile,
  companyLogoFile,
  setCompanyLogoFile,
  isAdmin,
  isUserSaving,
  onSubmit,
  userAvatarInputId,
  companyLogoInputId,
}: ProfileFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-16 rounded-full border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center overflow-hidden">
          {userAvatarFile ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(userAvatarFile)}
                alt="Nieuwe avatar"
                className="size-16 object-cover"
              />
            </>
          ) : displayUser.image ? (
            <Image
              src={displayUser.image}
              alt={displayUser.name}
              width={64}
              height={64}
              className="size-16 object-cover"
              unoptimized
            />
          ) : displayUser.name ? (
            <span className="text-base font-semibold">
              {getInitials(displayUser.name)}
            </span>
          ) : (
            <UserRound className="size-6 text-slate-400" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700">Profielfoto</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              id={userAvatarInputId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) =>
                setUserAvatarFile(event.target.files?.[0] ?? null)
              }
            />
            <label
              htmlFor={userAvatarInputId}
              className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Kies bestand
            </label>
            <span className="text-xs text-slate-500">
              {userAvatarFile
                ? userAvatarFile.name
                : displayUser.image
                ? "Huidige foto ingesteld"
                : "Geen bestand geselecteerd"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            PNG of JPG, maximaal 5 MB.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Voornaam
          <input
            type="text"
            value={userForm.firstName}
            onChange={(event) =>
              setUserForm((form) => ({
                ...form,
                firstName: event.target.value,
              }))
            }
            autoComplete="given-name"
            className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Achternaam
          <input
            type="text"
            value={userForm.lastName}
            onChange={(event) =>
              setUserForm((form) => ({
                ...form,
                lastName: event.target.value,
              }))
            }
            autoComplete="family-name"
            className="rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>
      </div>
      <>
        <label className="flex flex-col gap-1 text-sm">
          Bedrijfsnaam
          <div className="flex items-center rounded-lg border border-slate-300 px-3">
            <Building2 className="mr-2 size-4 text-slate-400" />
            <input
              type="text"
              value={userForm.companyName}
              onChange={(event) =>
                setUserForm((form) => ({
                  ...form,
                  companyName: event.target.value,
                }))
              }
              autoComplete="organization"
              className="w-full p-2 text-sm focus:outline-none"
              required={!isAdmin}
            />
          </div>
        </label>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
              {companyLogoFile ? (
                <img
                  src={URL.createObjectURL(companyLogoFile)}
                  alt="Nieuw bedrijfslogo"
                  className="size-14 object-cover"
                />
              ) : userForm.companyLogoUrl ? (
                <Image
                  src={userForm.companyLogoUrl}
                  alt={userForm.companyName || "Bedrijfslogo"}
                  width={56}
                  height={56}
                  className="size-14 object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-sm font-semibold">
                  {getInitials(userForm.companyName) || "B"}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">
                Bedrijfslogo
              </p>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id={companyLogoInputId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) =>
                    setCompanyLogoFile(event.target.files?.[0] ?? null)
                  }
                />
                <label
                  htmlFor={companyLogoInputId}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <ImagePlus className="size-3.5" />
                  Kies bestand
                </label>
                <span className="text-xs text-slate-500">
                  {companyLogoFile
                    ? companyLogoFile.name
                    : userForm.companyLogoUrl
                    ? "Huidig logo ingesteld"
                    : "Geen logo geselecteerd"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </>
      <p className="text-xs text-slate-500">Ingelogd als {displayUser.email}</p>
      <button
        type="submit"
        disabled={isUserSaving}
        className="rounded-lg bg-[#2ea3f2] px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isUserSaving ? "Opslaan..." : "Opslaan"}
      </button>
    </form>
  );
}
