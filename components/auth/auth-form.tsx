"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, UserRound } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email")?.toString() ?? "";
    const password = formData.get("password")?.toString() ?? "";
    const name = formData.get("name")?.toString() ?? "";

    if (!email || !password || (isSignUp && !name)) {
      setError("Vul alle vereiste velden in.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        await authClient.signUp.email({
          email,
          password,
          name,
        });
        setSuccess("Account aangemaakt. Je wordt doorgestuurd...");
      } else {
        await authClient.signIn.email({
          email,
          password,
        });
      }
      router.push("/");
      router.refresh();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Er is iets misgegaan.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Interly Talenttool
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {isSignUp ? "Maak een account" : "Log in"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {isSignUp
              ? "Start met het begeleiden van cliënten via het coachportaal."
              : "Meld je aan om toegang te krijgen tot je coachomgeving."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <label className="block text-sm font-medium text-slate-700">
              Naam
              <div className="mt-1 flex items-center rounded-2xl border border-slate-200 px-3 py-2">
                <UserRound className="mr-2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="Voor- en achternaam"
                  className="w-full border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </label>
          )}

          <label className="block text-sm font-medium text-slate-700">
            E-mailadres
            <div className="mt-1 flex items-center rounded-2xl border border-slate-200 px-3 py-2">
              <Mail className="mr-2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="jij@example.com"
                className="w-full border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                required
              />
            </div>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Wachtwoord
            <div className="mt-1 flex items-center rounded-2xl border border-slate-200 px-3 py-2">
              <Lock className="mr-2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                name="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder="Minimaal 8 tekens"
                className="w-full border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
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
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting
              ? "Even geduld..."
              : isSignUp
                ? "Account aanmaken"
                : "Inloggen"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          {isSignUp ? "Al een account?" : "Nog geen account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignUp ? "sign-in" : "sign-up");
              setError(null);
              setSuccess(null);
            }}
            className="font-semibold text-slate-900 underline"
          >
            {isSignUp ? "Log in" : "Maak er een aan"}
          </button>
        </p>
      </div>
    </div>
  );
}
