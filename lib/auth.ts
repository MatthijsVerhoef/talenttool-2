import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "./prisma";

if (!process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is required for authentication to work.");
}

export const auth = betterAuth({
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
