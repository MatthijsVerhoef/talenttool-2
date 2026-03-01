import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { getRequestId, logError, logInfo } from "@/lib/observability";
import { prisma } from "./prisma";

if (!process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is required for authentication to work.");
}

function getAuthBaseUrl() {
  const configured =
    process.env.BETTER_AUTH_URL ??
    process.env.VERCEL_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!configured) {
    const port = process.env.PORT ?? "3000";
    return `http://localhost:${port}`;
  }

  const normalized = configured.replace(/\/$/, "");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      const parsed = new URL(normalized);
      const runtimePort = process.env.PORT;
      if (
        runtimePort &&
        parsed.hostname === "localhost" &&
        parsed.port &&
        parsed.port !== runtimePort
      ) {
        parsed.port = runtimePort;
      }
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return normalized;
    }
  }

  return `https://${normalized}`;
}

const AUTH_DEBUG_ENABLED =
  process.env.AUTH_DEBUG === "1" || process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";

export function isAuthDebugEnabled() {
  return AUTH_DEBUG_ENABLED;
}

export function getCookieNamesFromHeader(cookieHeader: string | null | undefined): string[] {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(";")
    .map((part) => part.split("=", 1)[0]?.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name, index, all) => all.indexOf(name) === index);
}

export async function getServerSessionFromRequest(
  request: Request,
  context?: {
    requestId?: string;
    source?: string;
  },
): Promise<AuthSession | null> {
  const requestId = context?.requestId ?? getRequestId(request);
  return getServerSessionFromCookieHeader(request.headers.get("cookie") ?? "", {
    requestId,
    source: context?.source,
  });
}

export async function getServerSessionFromCookieHeader(
  cookieHeader: string,
  context?: {
    requestId?: string;
    source?: string;
  },
): Promise<AuthSession | null> {
  const requestId = context?.requestId ?? randomUUID();
  try {
    const session = await auth.api.getSession({
      headers: { cookie: cookieHeader },
    });

    if (AUTH_DEBUG_ENABLED) {
      logInfo("auth.session.read", {
        requestId,
        source: context?.source ?? null,
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null,
        cookieNames: getCookieNamesFromHeader(cookieHeader),
      });
    }

    return session;
  } catch (error) {
    if (AUTH_DEBUG_ENABLED) {
      logError("auth.session.read.error", {
        requestId,
        source: context?.source ?? null,
        cookieNames: getCookieNamesFromHeader(cookieHeader),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

export const auth = betterAuth({
  baseURL: getAuthBaseUrl(),
  secret: process.env.AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "COACH",
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    passwordPolicy: {
      minLength: 8,
    },
  },
  session: {
    cookieCache: {
      enabled: false,
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
