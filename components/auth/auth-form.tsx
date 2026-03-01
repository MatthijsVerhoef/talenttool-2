"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, UserRound } from "lucide-react";

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

  const isInviteFlow = Boolean(invite);
  const isSignUp = isInviteFlow;
  const inviteExpiresAt = useMemo(() => {
    if (!invite?.expiresAt) {
      return null;
    }
    const parsed = new Date(invite.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toLocaleString();
  }, [invite?.expiresAt]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = invite?.email ?? formData.get("email")?.toString() ?? "";
    const password = formData.get("password")?.toString() ?? "";
    const name = formData.get("name")?.toString() ?? "";

    if (!email || !password || (isSignUp && !name)) {
      setError("Vul alle vereiste velden in.");
      return;
    }

    if (!isInviteFlow && isSignUp) {
      setError("Registreren kan alleen via een uitnodiging.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        if (invite) {
          const response = await fetch(
            `/api/invitations/${invite.token}/accept`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name,
                password,
              }),
            }
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              data.error ?? "Uitnodiging accepteren is mislukt."
            );
          }
          setSuccess("Welkom! Je account is aangemaakt.");
        } else {
          await signUpWithEmail({
            email,
            password,
            name,
          });
          setSuccess("Account aangemaakt. Je wordt doorgestuurd...");
        }
      } else {
        await signInWithEmail({
          email,
          password,
        });
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Er is iets misgegaan.";
      setError(message);
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100">
      <img
        alt="background"
        src="/talenttool-bg.png"
        className="absolute top-0 left-0 w-screen h-screen"
      />
      <div className="w-full relative z-2 max-w-sm h-140 space-y-6 flex flex-col items-center py-13 rounded-3xl bg-white/60 backdrop-blur-2xl p-8 shadow-md">
        <div className="text-center w-full">
          <img alt="logo" className="mx-auto mb-4" src="/talenttool-logo.svg" />
          <p className="mt-2 text-sm text-slate-500">
            {isInviteFlow
              ? `Je bent uitgenodigd om als coach te starten via ${invite?.email}.`
              : "Log in met je bestaande account. Nieuwe coach? Vraag je beheerder om een uitnodiging."}
          </p>
          {isInviteFlow && inviteExpiresAt && (
            <p className="text-xs text-slate-500">
              Uitnodiging verloopt op {inviteExpiresAt}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 w-full">
          {isSignUp && (
            <label className="block text-sm font-medium text-slate-700">
              <span className="ml-3">Naam</span>
              <div className="mt-1 flex items-center rounded-full border border-gray-200 pl-4 pr-3 py-2">
                <UserRound className="mr-2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="Voor- en achternaam"
                  className="w-full h-8 border-none bg-transparent text-sm text-slate-900 placeholder:text-gray-400 focus:outline-none"
                  required
                />
              </div>
            </label>
          )}

          <label className="block text-sm font-medium text-slate-700">
            <span className="ml-3">E-mailadres</span>
            <div className="mt-1 flex items-center rounded-full border border-gray-200 pl-4 pr-3 py-2">
              <Mail className="mr-2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="jij@example.com"
                defaultValue={invite?.email}
                readOnly={isInviteFlow}
                className="w-full h-8 border-none bg-transparent text-sm text-slate-900 placeholder:text-gray-400 focus:outline-none"
                required
              />
            </div>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            <span className="ml-3">Wachtwoord</span>
            <div className="mt-1 flex items-center rounded-full border border-gray-200 pr-3 pl-4 py-2">
              <Lock className="mr-2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                name="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder="Minimaal 8 tekens"
                className="w-full h-8 border-none bg-transparent text-sm text-slate-900 placeholder:text-gray-400 focus:outline-none"
                minLength={8}
                required
              />
            </div>
          </label>

          {error && (
            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full h-12 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting
              ? "Even geduld..."
              : isSignUp
                ? "Account aanmaken"
                : "Inloggen"}
          </button>
        </form>

        {isInviteFlow ? (
          <p className="text-center text-sm text-slate-500">
            Heb je al een account?{" "}
            <a href="/login" className="font-semibold text-slate-900 underline">
              Log hier in
            </a>
          </p>
        ) : (
          <p className="text-center text-sm text-slate-500">
            Toegang nodig? Vraag een beheerder om een uitnodiging.
          </p>
        )}
      </div>
    </div>
  );
}
