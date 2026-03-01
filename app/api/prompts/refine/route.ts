import { NextResponse } from "next/server";
import { AgentKind } from "@prisma/client";

import { OpenAITimeoutError } from "@/lib/ai/openai";
import { DEFAULT_COACH_ROLE_PROMPT, DEFAULT_OVERSEER_ROLE_PROMPT } from "@/lib/agents/prompts";
import { refinePromptWithFeedback } from "@/lib/agents/prompt-refiner";
import { SessionGuardError, requireAdminSession } from "@/lib/auth-guards";
import {
  getCoachPrompt,
  getOverseerPrompt,
  listAgentFeedback,
  updateCoachPrompt,
  updateOverseerPrompt,
} from "@/lib/data/store";
import { getRequestId, logError, logInfo } from "@/lib/observability";
import { getClientIp } from "@/lib/request";

function normalizeAgentType(input: unknown): AgentKind | null {
  if (input === "COACH" || input === AgentKind.COACH) {
    return AgentKind.COACH;
  }
  if (input === "OVERSEER" || input === AgentKind.OVERSEER) {
    return AgentKind.OVERSEER;
  }
  return null;
}

async function getBasePrompt(agentType: AgentKind) {
  if (agentType === AgentKind.COACH) {
    const record = await getCoachPrompt();
    return record?.content ?? DEFAULT_COACH_ROLE_PROMPT;
  }
  const record = await getOverseerPrompt();
  return record?.content ?? DEFAULT_OVERSEER_ROLE_PROMPT;
}

function jsonWithRequestId(
  requestId: string,
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  response.headers.set("x-request-id", requestId);
  return response;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const route = "/api/prompts/refine";
  const startedAt = Date.now();

  try {
    const session = await requireAdminSession(request, requestId);
    const payload = await request.json().catch(() => null);
    const agentType = normalizeAgentType(
      (payload as { agentType?: string })?.agentType,
    );

    if (!agentType) {
      const durationMs = Date.now() - startedAt;
      logInfo("prompts.mutate", {
        requestId: session.requestId,
        userId: session.userId,
        promptKey: null,
        action: "update",
        oldLength: null,
        newLength: null,
        route,
        status: 400,
        durationMs,
      });
      return jsonWithRequestId(
        session.requestId,
        { error: "Agenttype ontbreekt." },
        { status: 400 },
      );
    }

    const promptKey = agentType === AgentKind.COACH ? "coach" : "overseer";
    const feedback = await listAgentFeedback(agentType, 10);
    if (!feedback.length) {
      const durationMs = Date.now() - startedAt;
      logInfo("prompts.mutate", {
        requestId: session.requestId,
        userId: session.userId,
        promptKey,
        action: "update",
        oldLength: null,
        newLength: null,
        route,
        status: 400,
        durationMs,
        feedbackCount: 0,
      });
      return jsonWithRequestId(
        session.requestId,
        { error: "Er is nog geen feedback beschikbaar voor dit agenttype." },
        { status: 400 },
      );
    }

    const basePrompt = await getBasePrompt(agentType);

    const refined = await refinePromptWithFeedback({
      agentType,
      basePrompt,
      feedback: feedback.map((item) => ({
        id: item.id,
        feedback: item.feedback,
        messageContent: item.messageContent,
      })),
      requestId: session.requestId,
    });

    const saved =
      agentType === AgentKind.COACH
        ? await updateCoachPrompt(
            refined,
            session.userId,
            session.requestId,
            getClientIp(request) ?? undefined,
          )
        : await updateOverseerPrompt(
            refined,
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
      feedbackCount: feedback.length,
    });

    return jsonWithRequestId(session.requestId, {
      agentType,
      prompt: saved.prompt.content,
      updatedAt: saved.prompt.updatedAt,
      usedFeedback: feedback,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (error instanceof SessionGuardError) {
      logInfo("prompts.mutate", {
        requestId: error.requestId,
        promptKey: null,
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

    const isTimeout = error instanceof OpenAITimeoutError;
    const status = isTimeout ? 504 : 500;
    logError("prompts.mutate.error", {
      requestId,
      promptKey: null,
      route,
      status,
      durationMs,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return jsonWithRequestId(
      requestId,
      {
        error: isTimeout
          ? "Prompt herschrijven duurde te lang."
          : "Prompt herschrijven is mislukt.",
        requestId,
      },
      { status },
    );
  }
}
