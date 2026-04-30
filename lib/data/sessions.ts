import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AgentRole = "user" | "assistant" | "system" | "overseer";
export type MessageSource = "AI" | "HUMAN";

export interface AgentMessage {
  id: string;
  role: AgentRole;
  source: MessageSource;
  content: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
}

export interface StoredAgentMessage extends AgentMessage {
  clientId?: string;
}

export interface OverseerMessageContext {
  clientId?: string;
  coachingSessionId?: string;
  sourceAgentMessageId?: string;
}

function mapAgentMessage(message: {
  id: string;
  role: string;
  source?: MessageSource | null;
  content: string;
  createdAt: Date;
  meta: Prisma.JsonValue | null;
}): AgentMessage {
  return {
    id: message.id,
    role: (message.role as AgentRole) ?? "assistant",
    source: message.source ?? "AI",
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    meta: (message.meta as Record<string, unknown> | null) ?? null,
  };
}

function mapOverseerMessage(message: {
  id: string;
  coachUserId?: string;
  clientId?: string | null;
  coachingSessionId?: string | null;
  sourceAgentMessageId?: string | null;
  role: string;
  source?: MessageSource | null;
  content: string;
  createdAt: Date;
  meta: Prisma.JsonValue | null;
}): AgentMessage {
  const baseMeta =
    message.meta && typeof message.meta === "object"
      ? { ...(message.meta as Record<string, unknown>) }
      : {};
  const context: OverseerMessageContext = {
    clientId: message.clientId ?? undefined,
    coachingSessionId: message.coachingSessionId ?? undefined,
    sourceAgentMessageId: message.sourceAgentMessageId ?? undefined,
  };
  const hasContext =
    Boolean(context.clientId) ||
    Boolean(context.coachingSessionId) ||
    Boolean(context.sourceAgentMessageId);
  const mergedMeta = {
    ...baseMeta,
    ...(hasContext ? { context } : {}),
  };

  return {
    id: message.id,
    role: (message.role as AgentRole) ?? "assistant",
    source: message.source ?? "AI",
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    meta: Object.keys(mergedMeta).length > 0 ? mergedMeta : null,
  };
}

async function ensureSession(userId: string, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });

  if (!client) {
    return null;
  }

  return prisma.coachingSession.upsert({
    where: {
      ownerUserId_clientId: {
        ownerUserId: userId,
        clientId,
      },
    },
    update: {},
    create: {
      ownerUserId: userId,
      clientId,
      title: "Default Session",
    },
  });
}

export async function getOrCreateCoachingSession(
  userId: string,
  clientId: string
): Promise<{ id: string; ownerUserId: string; clientId: string } | null> {
  const session = await ensureSession(userId, clientId);
  if (!session) {
    return null;
  }
  return {
    id: session.id,
    ownerUserId: session.ownerUserId,
    clientId: session.clientId,
  };
}

export async function getOwnedCoachingSession(
  ownerUserId: string,
  coachingSessionId: string
): Promise<{ id: string; clientId: string } | null> {
  return prisma.coachingSession.findFirst({
    where: {
      id: coachingSessionId,
      ownerUserId,
    },
    select: {
      id: true,
      clientId: true,
    },
  });
}

export async function getOwnedAgentMessage(
  ownerUserId: string,
  messageId: string
): Promise<{ id: string; sessionId: string; clientId: string } | null> {
  const record = await prisma.agentMessage.findFirst({
    where: {
      id: messageId,
      session: {
        ownerUserId,
      },
    },
    select: {
      id: true,
      sessionId: true,
      session: {
        select: {
          clientId: true,
        },
      },
    },
  });

  if (!record) {
    return null;
  }
  return {
    id: record.id,
    sessionId: record.sessionId,
    clientId: record.session.clientId,
  };
}

export async function appendClientMessage(
  userId: string,
  clientId: string,
  role: AgentRole,
  content: string,
  meta?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
  source: MessageSource = "AI"
): Promise<AgentMessage> {
  const session = await ensureSession(userId, clientId);
  if (!session) {
    throw new Error(`Client ${clientId} not found.`);
  }

  const message = await prisma.agentMessage.create({
    data: {
      sessionId: session.id,
      role,
      content,
      source,
      meta,
    },
  });

  return mapAgentMessage(message);
}

export async function getSessionWindow(
  userId: string,
  clientId: string,
  limit = 12
): Promise<AgentMessage[] | null> {
  const session = await ensureSession(userId, clientId);
  if (!session) {
    return null;
  }

  const messages = await prisma.agentMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse().map(mapAgentMessage);
}

export async function appendOverseerMessage(
  coachUserId: string,
  role: "user" | "assistant",
  content: string,
  ctx?: OverseerMessageContext & {
    source?: MessageSource;
    meta?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  }
): Promise<AgentMessage> {
  const source = ctx?.source ?? (role === "user" ? "HUMAN" : "AI");
  const message = await prisma.overseerMessage.create({
    data: {
      coachUserId,
      role,
      source,
      content,
      meta: ctx?.meta,
      clientId: ctx?.clientId,
      coachingSessionId: ctx?.coachingSessionId,
      sourceAgentMessageId: ctx?.sourceAgentMessageId,
    },
  });

  return mapOverseerMessage(message);
}

export async function getOverseerWindow(
  coachUserId: string,
  limit = 20
): Promise<AgentMessage[]> {
  const messages = await prisma.overseerMessage.findMany({
    where: { coachUserId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse().map(mapOverseerMessage);
}

export async function getAgentMessageById(
  messageId: string
): Promise<StoredAgentMessage | null> {
  const record = await prisma.agentMessage.findUnique({
    where: { id: messageId },
    include: {
      session: {
        select: {
          clientId: true,
        },
      },
    },
  });

  if (!record) {
    return null;
  }

  return {
    ...mapAgentMessage(record),
    clientId: record.session?.clientId,
  };
}

export async function getOverseerMessageById(
  messageId: string,
  coachUserId?: string
): Promise<StoredAgentMessage | null> {
  const record = await prisma.overseerMessage.findFirst({
    where: {
      id: messageId,
      ...(coachUserId ? { coachUserId } : {}),
    },
  });

  if (!record) {
    return null;
  }

  return mapOverseerMessage(record);
}
