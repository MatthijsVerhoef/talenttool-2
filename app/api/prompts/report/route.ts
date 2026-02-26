import { NextResponse } from "next/server";

import { DEFAULT_REPORT_ROLE_PROMPT } from "@/lib/agents/prompts";
import {
  SessionGuardError,
  requireAdminSession,
  requireAuthenticatedSession,
} from "@/lib/auth-guards";
import { getReportPrompt, updateReportPrompt } from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";
import { getClientIp } from "@/lib/request";

function jsonWithRequestId(
  requestId: string,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("x-request-id", requestId);
  return response;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const route = "/api/prompts/report";
  const promptKey = "report";
  const startedAt = Date.now();

  try {
    const session = await requireAuthenticatedSession(request, requestId);
    const prompt = await getReportPrompt();
    const resolvedPrompt = prompt?.content ?? DEFAULT_REPORT_ROLE_PROMPT;
    const durationMs = Date.now() - startedAt;

    logInfo("prompts.read", {
      requestId: session.requestId,
      userId: session.userId,
      promptKey,
      route,
      status: 200,
      durationMs,
      promptLength: resolvedPrompt.length,
      isCustom: Boolean(prompt),
    });

    return jsonWithRequestId(session.requestId, {
      prompt: resolvedPrompt,
      updatedAt: prompt?.updatedAt ?? null,
      isCustom: Boolean(prompt),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof SessionGuardError) {
      logInfo("prompts.read", {
        requestId: error.requestId,
        promptKey,
        route,
        status: error.status,
        durationMs,
      });
      return jsonWithRequestId(
        error.requestId,
        { error: error.message },
        { status: error.status },
      );
    }

    logError("prompts.read.error", {
      requestId,
      promptKey,
      route,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return jsonWithRequestId(
      requestId,
      { error: "Prompt ophalen is mislukt." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const route = "/api/prompts/report";
  const promptKey = "report";
  const startedAt = Date.now();

  try {
    const session = await requireAdminSession(request, requestId);
    const body = await request.json();
    const promptText = (body?.prompt ?? "").toString().trim();

    if (!promptText) {
      const durationMs = Date.now() - startedAt;
      logInfo("prompts.mutate", {
        requestId: session.requestId,
        userId: session.userId,
        promptKey,
        action: "update",
        oldLength: null,
        newLength: 0,
        route,
        status: 400,
        durationMs,
      });
      return jsonWithRequestId(
        session.requestId,
        { error: "Prompt mag niet leeg zijn." },
        { status: 400 },
      );
    }

    const saved = await updateReportPrompt(
      promptText,
      session.userId,
      session.requestId,
      getClientIp(request) ?? undefined,
    );

    const durationMs = Date.now() - startedAt;
    logInfo("prompts.mutate", {
      requestId: session.requestId,
      userId: session.userId,
      promptKey,
      action: saved.action,
      oldLength: saved.oldLength,
      newLength: saved.newLength,
      route,
      status: 200,
      durationMs,
    });

    return jsonWithRequestId(session.requestId, {
      prompt: saved.prompt.content,
      updatedAt: saved.prompt.updatedAt,
      isCustom: true,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof SessionGuardError) {
      logInfo("prompts.mutate", {
        requestId: error.requestId,
        promptKey,
        action: "update",
        oldLength: null,
        newLength: null,
        route,
        status: error.status,
        durationMs,
      });
      return jsonWithRequestId(
        error.requestId,
        { error: error.message },
        { status: error.status },
      );
    }

    logError("prompts.mutate.error", {
      requestId,
      promptKey,
      route,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      { error: "Prompt opslaan is mislukt." },
      { status: 500 },
    );
  }
}
