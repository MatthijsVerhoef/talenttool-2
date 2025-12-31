import { createAuthClient } from "better-auth/react";

const appBaseUrl =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:3000";

const normalizedBaseUrl = appBaseUrl.replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: `${normalizedBaseUrl}/api/auth`,
});
