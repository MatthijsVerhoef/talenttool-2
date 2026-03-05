import { NextResponse } from "next/server";

import {
  getCookieNamesFromHeader,
  getServerSessionFromRequest,
  isAuthDebugEnabled,
} from "@/lib/auth";
import { getRequestId } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonWithHeaders(requestId: string, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  if (process.env.NODE_ENV === "production") {
    return jsonWithHeaders(requestId, { error: "Niet gevonden." }, { status: 404 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/auth/debug",
  });

  return jsonWithHeaders(requestId, {
    authDebugEnabled: isAuthDebugEnabled(),
    hasSession: Boolean(session),
    userId: session?.user?.id ?? null,
    cookieNames: getCookieNamesFromHeader(cookieHeader),
    timestamp: new Date().toISOString(),
  });
}
