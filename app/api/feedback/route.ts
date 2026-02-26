import { NextResponse } from "next/server";
import { AgentKind } from "@prisma/client";

import { auth } from "@/lib/auth";
import {
  createAgentFeedback,
  getAgentMessageById,
  getOverseerMessageById,
  listAgentFeedback,
  type StoredAgentMessage,
} from "@/lib/data/store";

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
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const agentParam = searchParams.get("agentType");
  const limitParam = Number(searchParams.get("limit") ?? "0");
  const agentType = normalizeAgentType(agentParam);

  if (agentParam && !agentType) {
    return NextResponse.json({ error: "Ongeldig agenttype." }, { status: 400 });
  }

  const feedback = await listAgentFeedback(
    agentType ?? undefined,
    Number.isNaN(limitParam) || limitParam <= 0 ? 20 : limitParam,
  );

  return NextResponse.json({ feedback });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const { agentType: rawAgentType, messageId, feedback } = payload as {
    agentType?: string;
    messageId?: string;
    feedback?: string;
  };

  const agentType = normalizeAgentType(rawAgentType);
  if (!agentType) {
    return NextResponse.json({ error: "Agenttype ontbreekt." }, { status: 400 });
  }

  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json({ error: "Bericht-ID ontbreekt." }, { status: 400 });
  }

  if (!feedback || typeof feedback !== "string" || !feedback.trim()) {
    return NextResponse.json({ error: "Feedback mag niet leeg zijn." }, { status: 400 });
  }

  let message: StoredAgentMessage | null = null;

  if (agentType === AgentKind.COACH) {
    message = await getAgentMessageById(messageId);
  } else {
    message = await getOverseerMessageById(messageId, session.user.id);
  }

  if (!message) {
    return NextResponse.json({ error: "Bericht niet gevonden." }, { status: 404 });
  }

  if (message.role !== "assistant") {
    return NextResponse.json(
      { error: "Alleen AI-antwoorden kunnen van feedback worden voorzien." },
      { status: 400 },
    );
  }

  const saved = await createAgentFeedback({
    agentType,
    messageId,
    messageContent: message.content,
    feedback: feedback.trim(),
    createdById: session.user.id,
  });

  return NextResponse.json({ feedback: saved }, { status: 201 });
}
