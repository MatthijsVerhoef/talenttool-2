import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";

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
    return "http://localhost:3003";
  }

  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return configured.replace(/\/$/, "");
  }

  return `https://${configured.replace(/\/$/, "")}`;
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
      enabled: true,
      strategy: "jwt",
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
