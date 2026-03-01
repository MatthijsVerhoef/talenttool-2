import {
  auth,
  getCookieNamesFromHeader,
  isAuthDebugEnabled,
} from "@/lib/auth";
import { getRequestId, logError, logInfo } from "@/lib/observability";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = toNextJsHandler(auth);

function getSetCookieNames(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return [];
  }

  const names = setCookieHeader.match(/(?:^|,\s*)([^=;,\s]+)=/g) ?? [];
  return names
    .map((entry) => entry.replace(/^[,\s]+/, "").replace(/=$/, "").trim())
    .filter(Boolean)
    .filter((name, index, all) => all.indexOf(name) === index);
}

function withAuthRouteHandler(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  routeHandler: (request: Request) => Promise<Response>,
) {
  return async function authRoute(request: Request) {
    const requestId = getRequestId(request);
    const startedAt = Date.now();
    const cookieHeader = request.headers.get("cookie") ?? "";
    const cookieNames = getCookieNamesFromHeader(cookieHeader);

    if (isAuthDebugEnabled()) {
      logInfo("auth.route.start", {
        requestId,
        method,
        path: new URL(request.url).pathname,
        cookieNames,
      });
    }

    try {
      const response = await routeHandler(request);
      const setCookieHeader = response.headers.get("set-cookie");
      response.headers.set("x-request-id", requestId);
      response.headers.set("Cache-Control", "no-store");

      if (isAuthDebugEnabled()) {
        logInfo("auth.route.end", {
          requestId,
          method,
          path: new URL(request.url).pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
          hasSetCookie: Boolean(setCookieHeader),
          setCookieNames: getSetCookieNames(setCookieHeader),
        });
      }

      return response;
    } catch (error) {
      if (isAuthDebugEnabled()) {
        logError("auth.route.error", {
          requestId,
          method,
          path: new URL(request.url).pathname,
          durationMs: Date.now() - startedAt,
          cookieNames,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  };
}

export const GET = withAuthRouteHandler("GET", handler.GET);
export const POST = withAuthRouteHandler("POST", handler.POST);
export const PUT = withAuthRouteHandler("PUT", handler.PUT);
export const PATCH = withAuthRouteHandler("PATCH", handler.PATCH);
export const DELETE = withAuthRouteHandler("DELETE", handler.DELETE);
