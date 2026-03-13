import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { auth } from "@/lib/auth";
import { findActiveInviteByToken } from "@/lib/data/users";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: {
      cookie: headerStore.get("cookie") ?? "",
    },
  });

  if (session) {
    redirect("/");
  }

  const { token } = await params;
  const invite = await findActiveInviteByToken(token);

  if (!invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100">
        <img
          alt="background"
          src="/talenttool-bg.png"
          className="absolute top-0 left-0 w-screen h-screen"
        />
        <div className="relative z-10 max-w-md rounded-3xl bg-white/80 p-8 text-center shadow-lg">
          <img
            alt="logo"
            src="/talenttool-logo.svg"
            className="mx-auto mb-4"
          />
          <h1 className="text-xl font-semibold text-slate-900">
            Uitnodiging verlopen
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Deze uitnodigingslink is verlopen of ongeldig. Vraag de beheerder om
            een nieuwe uitnodiging.
          </p>
          <a
            href="/login"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white"
          >
            Terug naar login
          </a>
        </div>
      </div>
    );
  }

  return (
    <AuthForm
      invite={{
        token: invite.token,
        email: invite.email,
        expiresAt: invite.expiresAt,
      }}
    />
  );
}
