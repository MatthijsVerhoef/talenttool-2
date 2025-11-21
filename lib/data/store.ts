import { prisma } from "@/lib/prisma";

export type AgentRole = "user" | "assistant" | "system" | "overseer";

export interface AgentMessage {
  id: string;
  role: AgentRole;
  source: MessageSource;
  content: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
}

export interface ClientProfile {
  id: string;
  name: string;
  focusArea: string;
  summary: string;
  goals: string[];
}

export interface ClientDocument {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  content?: string | null;
}

async function ensureSession(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) {
    return null;
  }

  let session = await prisma.coachingSession.findFirst({
    where: { clientId },
    orderBy: { createdAt: "asc" },
  });

  if (!session) {
    session = await prisma.coachingSession.create({
      data: {
        clientId,
        title: "Default Session",
      },
    });
  }

  return session;
}

export async function getClients(): Promise<ClientProfile[]> {
  const clients = await prisma.client.findMany({
    include: {
      goals: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    focusArea: client.focusArea,
    summary: client.summary,
    goals: client.goals.map((goal) => goal.value),
  }));
}

export async function getClient(clientId: string): Promise<ClientProfile | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { goals: true },
  });

  if (!client) {
    return null;
  }

  return {
    id: client.id,
    name: client.name,
    focusArea: client.focusArea,
    summary: client.summary,
    goals: client.goals.map((goal) => goal.value),
  };
}

export type MessageSource = "AI" | "HUMAN";

export async function appendClientMessage(
  clientId: string,
  role: AgentRole,
  content: string,
  meta?: Record<string, unknown>,
  source: MessageSource = "AI",
): Promise<AgentMessage> {
  const session = await ensureSession(clientId);
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
  clientId: string,
  limit = 12,
): Promise<AgentMessage[] | null> {
  const session = await ensureSession(clientId);
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

export async function recordOverseerMessage(
  role: AgentRole,
  source: MessageSource,
  content: string,
  meta?: Record<string, unknown>,
): Promise<AgentMessage> {
  const message = await prisma.overseerMessage.create({
    data: {
      role,
      source,
      content,
      meta,
    },
  });

  return mapOverseerMessage(message);
}

export async function getOverseerThread(limit = 20): Promise<AgentMessage[]> {
  const messages = await prisma.overseerMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse().map(mapOverseerMessage);
}

export async function getClientDigest(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { goals: true },
  });

  if (!client) {
    return "";
  }

  const latestAssistant = await prisma.agentMessage.findFirst({
    where: {
      session: {
        clientId,
      },
      role: "assistant",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return [
    `Cliënt: ${client.name}`,
    `Focus: ${client.focusArea}`,
    `Doelen: ${client.goals.map((goal) => goal.value).join("; ") || "Geen doelen bekend"}`,
    `Laatste coachnotitie: ${latestAssistant?.content ?? "Nog geen notities."}`,
  ].join("\n");
}

export async function listClientDigests(): Promise<string[]> {
  const clients = await prisma.client.findMany({
    select: { id: true },
  });

  const digests = await Promise.all(
    clients.map((client) => getClientDigest(client.id)),
  );

  return digests.filter((digest) => Boolean(digest));
}

function mapAgentMessage(message: {
  id: string;
  role: string;
  source?: MessageSource | null;
  content: string;
  createdAt: Date;
  meta: unknown | null;
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
  role: string;
  source?: MessageSource | null;
  content: string;
  createdAt: Date;
  meta: unknown | null;
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

export async function getClientDocuments(
  clientId: string,
  limit = 20,
): Promise<ClientDocument[]> {
  const documents = await prisma.clientDocument.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return documents.map(mapDocument);
}

export async function createClientDocument(input: {
  clientId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  content?: string;
}): Promise<ClientDocument> {
  const document = await prisma.clientDocument.create({
    data: {
      clientId: input.clientId,
      originalName: input.originalName,
      storedName: input.storedName,
      mimeType: input.mimeType,
      size: input.size,
      content: input.content,
    },
  });

  return mapDocument(document);
}

export async function getDocumentSnippets(
  clientId: string,
  limit = 3,
): Promise<string[]> {
  const documents = await prisma.clientDocument.findMany({
    where: { clientId, content: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return documents.map(
    (doc) =>
      `Document: ${doc.originalName}\nGeüpload op: ${doc.createdAt.toISOString()}\nInhoud:\n${
        doc.content?.slice(0, 1200) ?? "Geen inhoud beschikbaar."
      }`,
  );
}

function mapDocument(document: {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  content: string | null;
}): ClientDocument {
  return {
    id: document.id,
    originalName: document.originalName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    createdAt: document.createdAt.toISOString(),
    content: document.content,
  };
}
