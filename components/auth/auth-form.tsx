"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ImagePlus,
  Lock,
  Mail,
  UserRound,
  ArrowRight,
  ArrowLeft,
  Check,
} from "lucide-react";

import { signInWithEmail, signUpWithEmail } from "@/lib/auth-client";

interface AuthFormProps {
  invite?: {
    token: string;
    email: string;
    expiresAt: string;
  };
}

export function AuthForm({ invite }: AuthFormProps = {}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(
    null
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState({ companyName: "" });
  const companyLogoInputId = useId();

  const isInviteFlow = Boolean(invite);
  const isSignUp = isInviteFlow;

  const inviteExpiresAt = useMemo(() => {
    if (!invite?.expiresAt) return null;
    const parsed = new Date(invite.expiresAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
  }, [invite?.expiresAt]);

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setCompanyLogoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setCompanyLogoPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setCompanyLogoPreview(null);
    }
  }

  function handleStep1Next(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const companyName = formData.get("companyName")?.toString() ?? "";
    if (!companyName.trim()) {
      setError("Vul de bedrijfsnaam in.");
      return;
    }
    setError(null);
    setStep1Data({ companyName });
    setStep(2);
  }

  async function handleStep2Submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = invite?.email ?? formData.get("email")?.toString() ?? "";
    const password = formData.get("password")?.toString() ?? "";
    const firstName = formData.get("firstName")?.toString() ?? "";
    const lastName = formData.get("lastName")?.toString() ?? "";

    if (!email || !password) {
      setError("Vul alle vereiste velden in.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp && invite) {
        const inviteFormData = new FormData();
        inviteFormData.set("firstName", firstName);
        inviteFormData.set("lastName", lastName);
        inviteFormData.set("companyName", step1Data.companyName);
        inviteFormData.set("password", password);
        if (companyLogoFile) inviteFormData.set("companyLogo", companyLogoFile);

        const response = await fetch(
          `/api/invitations/${invite.token}/accept`,
          {
            method: "POST",
            body: inviteFormData,
          }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data.error ?? "Uitnodiging accepteren is mislukt.");
        setSuccess("Welkom! Je account is aangemaakt.");
      } else if (!isSignUp) {
        await signInWithEmail({ email, password });
      } else {
        setError("Registreren kan alleen via een uitnodiging.");
        setSubmitting(false);
        return;
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Er is iets misgegaan."
      );
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
    setSubmitting(false);
  }

  // ─── Login form (no steps) ─────────────────────────────────────────────────
  if (!isSignUp) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100">
        <img
          alt="background"
          src="/talenttool-bg.png"
          className="absolute inset-0 h-screen w-screen object-cover"
        />

        <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white/70 backdrop-blur-2xl p-8 shadow-xl space-y-6">
          <div className="text-center">
            <img
              alt="logo"
              className="mx-auto mb-5 h-8"
              src="/talenttool-logo.svg"
            />
            <p className="text-sm text-slate-500">
              Log in met je bestaande account. Nieuwe coach? Vraag je beheerder
              om een uitnodiging.
            </p>
          </div>

          <form onSubmit={handleStep2Submit} className="space-y-4">
            <InputField
              icon={<Mail className="h-4 w-4 text-slate-400" />}
              label="E-mailadres"
            >
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="jij@example.com"
                className={inputClass}
                required
              />
            </InputField>

            <InputField
              icon={<Lock className="h-4 w-4 text-slate-400" />}
              label="Wachtwoord"
            >
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Minimaal 8 tekens"
                className={inputClass}
                minLength={8}
                required
              />
            </InputField>

            {error && <ErrorMessage>{error}</ErrorMessage>}
            {success && <SuccessMessage>{success}</SuccessMessage>}

            <SubmitButton disabled={isSubmitting}>
              {isSubmitting ? "Even geduld..." : "Inloggen"}
            </SubmitButton>
          </form>

          <p className="text-center text-sm text-slate-500">
            Toegang nodig? Vraag een beheerder om een uitnodiging.
          </p>
        </div>
      </div>
    );
  }

  // ─── Sign-up: 2-step wizard ────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100">
      <img
        alt="background"
        src="/talenttool-bg.png"
        className="absolute inset-0 h-screen w-screen object-cover"
      />

      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-white/70 backdrop-blur-2xl p-8 shadow-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <img
            alt="logo"
            className="mx-auto mb-4 h-8"
            src="/talenttool-logo.svg"
          />
          <p className="text-sm text-slate-500">
            Je bent uitgenodigd om als coach te starten via{" "}
            <span className="font-medium text-slate-700">{invite?.email}</span>.
          </p>
        </div>

        {/* Step 1: Company */}
        {step === 1 && (
          <form onSubmit={handleStep1Next} className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Stap 1 — Bedrijfsinformatie
            </p>

            <InputField
              icon={<Building2 className="h-4 w-4 text-slate-400" />}
              label="Bedrijfsnaam"
            >
              <input
                type="text"
                name="companyName"
                autoComplete="organization"
                placeholder="Bedrijfsnaam"
                defaultValue={step1Data.companyName}
                className={inputClass}
                required
              />
            </InputField>

            {/* Logo upload */}
            <div className="rounded-2xl border border-[#dddddd] bg-white/60 px-4 py-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <ImagePlus className="h-4 w-4 text-slate-400" />
                Bedrijfslogo{" "}
                <span className="text-slate-400 font-normal">(optioneel)</span>
              </div>

              <input
                id={companyLogoInputId}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoChange}
              />

              <div className="flex items-center gap-3">
                {companyLogoPreview ? (
                  <img
                    src={companyLogoPreview}
                    alt="Logo preview"
                    className="h-10 w-10 rounded-lg object-contain border border-slate-200 bg-white p-1"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center shrink-0">
                    <ImagePlus className="h-4 w-4 text-slate-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={companyLogoInputId}
                    className="inline-flex cursor-pointer items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Kies bestand
                  </label>
                  {companyLogoFile && (
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {companyLogoFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <button
              type="submit"
              className="w-full rounded-full h-11 bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 flex items-center justify-center gap-2"
            >
              Volgende <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Step 2: Personal details */}
        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Stap 2 — Persoonlijke gegevens
            </p>

            <div className="grid grid-cols-2 gap-3">
              <InputField
                icon={<UserRound className="h-4 w-4 text-slate-400" />}
                label="Voornaam"
              >
                <input
                  type="text"
                  name="firstName"
                  autoComplete="given-name"
                  placeholder="Voornaam"
                  className={inputClass}
                  required
                />
              </InputField>
              <InputField
                icon={<UserRound className="h-4 w-4 text-slate-400" />}
                label="Achternaam"
              >
                <input
                  type="text"
                  name="lastName"
                  autoComplete="family-name"
                  placeholder="Achternaam"
                  className={inputClass}
                />
              </InputField>
            </div>

            <InputField
              icon={<Mail className="h-4 w-4 text-slate-400" />}
              label="E-mailadres"
            >
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="jij@example.com"
                defaultValue={invite?.email}
                readOnly={isInviteFlow}
                className={`${inputClass} ${
                  isInviteFlow ? "text-slate-400 cursor-not-allowed" : ""
                }`}
                required
              />
            </InputField>

            <InputField
              icon={<Lock className="h-4 w-4 text-slate-400" />}
              label="Wachtwoord"
            >
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                placeholder="Minimaal 8 tekens"
                className={inputClass}
                minLength={8}
                required
              />
            </InputField>

            {error && <ErrorMessage>{error}</ErrorMessage>}
            {success && <SuccessMessage>{success}</SuccessMessage>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className="flex items-center gap-1.5 rounded-full h-11 px-4 border border-slate-200 bg-white/50 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Terug
              </button>
              <SubmitButton disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Even geduld..." : "Account aanmaken"}
              </SubmitButton>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-slate-500">
          Heb je al een account?{" "}
          <a href="/login" className="font-semibold text-slate-900 underline">
            Log hier in
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

const inputClass =
  "w-full h-8 border-none bg-transparent text-sm text-slate-900 placeholder:text-gray-400 focus:outline-none";

function InputField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      <span className="ml-3 mb-1 block">{label}</span>
      <div className="flex items-center rounded-full border border-[#dddddd] bg-white/50 pl-4 pr-3 py-2">
        {icon}
        <div className="ml-2 flex-1">{children}</div>
      </div>
    </label>
  );
}

function SubmitButton({
  children,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`rounded-full h-11 bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 w-full ${className}`}
    >
      {children}
    </button>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
      {children}
    </p>
  );
}

function SuccessMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {children}
    </p>
  );
}
