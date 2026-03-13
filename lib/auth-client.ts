import { createAuthClient } from "better-auth/react";

import { normalizeUserName } from "@/lib/user-name";

const AUTH_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_AUTH_DEBUG === "1" || process.env.AUTH_DEBUG === "1";

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCookieNames() {
  if (typeof document === "undefined") {
    return [];
  }

  return document.cookie
    .split(";")
    .map((part) => part.split("=", 1)[0]?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name, index, all) => all.indexOf(name) === index);
}

type AuthClientResult = {
  data?: unknown;
  error?: {
    message?: string;
  } | null;
  response?: {
    status?: number;
  } | null;
};

function getResultStatus(result: unknown) {
  const status = (result as AuthClientResult | undefined)?.response?.status;
  return typeof status === "number" ? status : null;
}

function throwIfAuthError(result: unknown, fallbackMessage: string) {
  const errorMessage = (result as AuthClientResult | undefined)?.error?.message;
  if (errorMessage && errorMessage.trim().length > 0) {
    throw new Error(errorMessage);
  }
  if ((result as AuthClientResult | undefined)?.error) {
    throw new Error(fallbackMessage);
  }
}

async function refreshSessionSnapshot(requestId: string) {
  await authClient.getSession({
    query: {
      disableCookieCache: true,
      disableRefresh: true,
    },
    fetchOptions: {
      headers: {
        "x-request-id": requestId,
      },
      cache: "no-store",
    },
  });
}

async function getSessionSnapshot(requestId: string) {
  return authClient.getSession({
    query: {
      disableCookieCache: true,
      disableRefresh: true,
    },
    fetchOptions: {
      headers: {
        "x-request-id": requestId,
      },
      cache: "no-store",
    },
  });
}

function hasActiveSession(result: unknown) {
  const data = (result as AuthClientResult | undefined)?.data;
  if (!data || typeof data !== "object") {
    return false;
  }

  const sessionData = data as { session?: unknown; user?: unknown };
  return Boolean(sessionData.session && sessionData.user);
}

export const authClient = createAuthClient();

export async function signInWithEmail(input: { email: string; password: string }) {
  const requestId = createRequestId();

  if (AUTH_DEBUG_ENABLED) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "auth.client.signin.start",
        timestamp: new Date().toISOString(),
        requestId,
        cookieNames: getCookieNames(),
      }),
    );
  }

  const result = await authClient.signIn.email({
    ...input,
    fetchOptions: {
      headers: {
        "x-request-id": requestId,
      },
      cache: "no-store",
    },
  });
  throwIfAuthError(result, "Inloggen is mislukt.");
  await refreshSessionSnapshot(requestId);

  if (AUTH_DEBUG_ENABLED) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "auth.client.signin.end",
        timestamp: new Date().toISOString(),
        requestId,
        status: getResultStatus(result),
        cookieNames: getCookieNames(),
      }),
    );
  }

  return result;
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companyLogoUrl?: string;
}) {
  const requestId = createRequestId();
  const normalizedName = normalizeUserName(input);

  if (!normalizedName) {
    throw new Error("Naam is verplicht.");
  }

  const result = await authClient.signUp.email({
    email: input.email,
    password: input.password,
    name: normalizedName,
    ...(typeof input.companyName === "string"
      ? { companyName: input.companyName.trim() }
      : {}),
    ...(typeof input.companyLogoUrl === "string"
      ? { companyLogoUrl: input.companyLogoUrl.trim() }
      : {}),
    fetchOptions: {
      headers: {
        "x-request-id": requestId,
      },
      cache: "no-store",
    },
  });
  throwIfAuthError(result, "Registreren is mislukt.");
  await refreshSessionSnapshot(requestId);
  return result;
}

export async function signOutUser() {
  const requestId = createRequestId();

  if (AUTH_DEBUG_ENABLED) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "auth.client.signout.start",
        timestamp: new Date().toISOString(),
        requestId,
        cookieNames: getCookieNames(),
      }),
    );
  }

  const result = await authClient.signOut({
    fetchOptions: {
      headers: {
        "x-request-id": requestId,
      },
      cache: "no-store",
    },
  });
  throwIfAuthError(result, "Uitloggen is mislukt.");
  await refreshSessionSnapshot(requestId);

  const firstSnapshot = await getSessionSnapshot(requestId);
  if (hasActiveSession(firstSnapshot)) {
    const retryResult = await authClient.signOut({
      fetchOptions: {
        headers: {
          "x-request-id": requestId,
        },
        cache: "no-store",
      },
    });

    throwIfAuthError(retryResult, "Uitloggen is mislukt.");
    await refreshSessionSnapshot(requestId);

    const secondSnapshot = await getSessionSnapshot(requestId);
    if (hasActiveSession(secondSnapshot)) {
      throw new Error("Uitloggen is niet volledig gelukt. Probeer opnieuw.");
    }
  }

  if (AUTH_DEBUG_ENABLED) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "auth.client.signout.end",
        timestamp: new Date().toISOString(),
        requestId,
        status: getResultStatus(result),
        cookieNames: getCookieNames(),
      }),
    );
  }

  return result;
}
