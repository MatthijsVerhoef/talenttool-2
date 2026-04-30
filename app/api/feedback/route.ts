import { AgentKind } from "@prisma/client";

import { SessionGuardError, requireAdminSession, requireAdminOrCoachSession } from "@/lib/auth-guards";
import { createAgentFeedback, listAgentFeedback } from "@/lib/data/feedback";
import {
  getAgentMessageById,
  getOverseerMessageById,
  type StoredAgentMessage,
} from "@/lib/data/sessions";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

function normalizeAgentType(input: unknown): AgentKind | null {
  if (input === "COACH" || input === AgentKind.COACH) {
    return AgentKind.COACH;
  }
  if (input === "OVERSEER" || input === AgentKind.OVERSEER) {
    return AgentKind.OVERSEER;
  }
  return null;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const { searchParams } = new URL(request.url);
    const agentParam = searchParams.get("agentType");
    const limitParam = Number(searchParams.get("limit") ?? "0");
    const agentType = normalizeAgentType(agentParam);

    if (agentParam && !agentType) {
      return jsonWithRequestId(session.requestId, { error: "Ongeldig agenttype." }, { status: 400 });
    }

    const feedback = await listAgentFeedback(
      agentType ?? undefined,
      Number.isNaN(limitParam) || limitParam <= 0 ? 20 : limitParam,
    );

    return jsonWithRequestId(session.requestId, { feedback });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminOrCoachSession(request, requestId);

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonWithRequestId(session.requestId, { error: "Ongeldig verzoek." }, { status: 400 });
    }

    const { agentType: rawAgentType, messageId, feedback } = payload as {
      agentType?: string;
      messageId?: string;
      feedback?: string;
      messageContent?: string;
    };
    const payloadMessageContent =
      typeof (payload as { messageContent?: unknown }).messageContent === "string"
        ? (payload as { messageContent: string }).messageContent.trim()
        : "";

    const agentType = normalizeAgentType(rawAgentType);
    if (!agentType) {
      return jsonWithRequestId(session.requestId, { error: "Agenttype ontbreekt." }, { status: 400 });
    }

    if (!messageId || typeof messageId !== "string") {
      return jsonWithRequestId(session.requestId, { error: "Bericht-ID ontbreekt." }, { status: 400 });
    }

    if (!feedback || typeof feedback !== "string" || !feedback.trim()) {
      return jsonWithRequestId(session.requestId, { error: "Feedback mag niet leeg zijn." }, { status: 400 });
    }

    let message: StoredAgentMessage | null = null;

    if (agentType === AgentKind.COACH) {
      message = await getAgentMessageById(messageId);
    } else {
      message = await getOverseerMessageById(messageId, session.userId);
      if (!message) {
        message = await getOverseerMessageById(messageId);
      }
    }

    if (!message && !payloadMessageContent) {
      return jsonWithRequestId(session.requestId, { error: "Bericht niet gevonden." }, { status: 404 });
    }

    if (message && message.role !== "assistant") {
      return jsonWithRequestId(
        session.requestId,
        { error: "Alleen AI-antwoorden kunnen van feedback worden voorzien." },
        { status: 400 }
      );
    }

    const saved = await createAgentFeedback({
      agentType,
      messageId,
      messageContent: message?.content ?? payloadMessageContent,
      feedback: feedback.trim(),
      createdById: session.userId,
    });

    return jsonWithRequestId(session.requestId, { feedback: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    throw error;
  }
}
