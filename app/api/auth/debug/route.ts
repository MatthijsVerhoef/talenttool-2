import {
  getCookieNamesFromHeader,
  getServerSessionFromRequest,
  isAuthDebugEnabled,
} from "@/lib/auth";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  if (process.env.NODE_ENV === "production") {
    return jsonWithRequestId(requestId, { error: "Niet gevonden." }, { status: 404 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/auth/debug",
  });

  return jsonWithRequestId(requestId, {
    authDebugEnabled: isAuthDebugEnabled(),
    hasSession: Boolean(session),
    userId: session?.user?.id ?? null,
    cookieNames: getCookieNamesFromHeader(cookieHeader),
    timestamp: new Date().toISOString(),
  });
}
