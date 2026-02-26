import {
  AgentKind,
  Prisma,
  ResponseLayerMode as PrismaResponseLayerMode,
  ResponseLayerTarget as PrismaResponseLayerTarget,
  UserRole,
  type ClientDocument as PrismaClientDocument,
} from "@prisma/client";

import { DEFAULT_COACH_MODEL, DEFAULT_OVERSEER_MODEL } from "@/lib/agents/models";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/security/hash";

export type AgentRole = "user" | "assistant" | "system" | "overseer";

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

export interface ClientProfile {
  id: string;
  name: string;
  focusArea: string;
  summary: string;
  goals: string[];
  avatarUrl?: string | null;
  coachId?: string | null;
}

export interface ClientDocument {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: DocumentKind;
  createdAt: string;
  audioDuration?: number | null;
  content?: string | null;
}

export interface ClientDocumentWithClient extends ClientDocument {
  clientId: string;
}

export interface ClientReport {
  id: string;
  content: string;
  createdAt: string;
}

export type DocumentKind = "TEXT" | "AUDIO";

export type ResponseLayerMode = PrismaResponseLayerMode;
export type ResponseLayerTarget = PrismaResponseLayerTarget;

export interface AIResponseLayerRecord {
  id: string;
  name: string;
  description: string;
  instructions: string;
  target: ResponseLayerTarget;
  mode: ResponseLayerMode;
  model: string;
  temperature: number;
  position: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const COACH_PROMPT_ID = "coach-role";
const OVERSEER_PROMPT_ID = "overseer-role";
const REPORT_PROMPT_ID = "report-role";
const COACH_MODEL_SETTING_ID = "coach-model";
const OVERSEER_MODEL_SETTING_ID = "overseer-model";
const DOCUMENT_SNIPPET_MAX_CHARS = Number(process.env.DOCUMENT_SNIPPET_MAX_CHARS ?? "0");

export type PromptKey = "coach" | "overseer" | "report";

const PROMPT_ID_BY_KEY: Record<PromptKey, string> = {
  coach: COACH_PROMPT_ID,
  overseer: OVERSEER_PROMPT_ID,
  report: REPORT_PROMPT_ID,
};

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

export async function getClients(options?: {
  userId?: string;
  role?: UserRole;
}): Promise<ClientProfile[]> {
  if (options?.role && options.role !== UserRole.ADMIN && !options?.userId) {
    return [];
  }

  const clients = await prisma.client.findMany({
    where:
      options?.role && options.role !== UserRole.ADMIN
        ? { coachId: options.userId }
        : undefined,
    include: {
      goals: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return clients.map(mapClientProfile);
}

export async function getClient(clientId: string): Promise<ClientProfile | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { goals: true },
  });

  if (!client) {
    return null;
  }

  return mapClientProfile(client);
}

export async function getClientForUser(
  clientId: string,
  userId: string,
  role: UserRole
): Promise<ClientProfile | null> {
  if (role !== UserRole.ADMIN) {
    const ownsClient = await assertCoachOwnsClient(userId, clientId);
    if (!ownsClient) {
      return null;
    }
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { goals: true },
  });

  if (!client) {
    return null;
  }

  return mapClientProfile(client);
}

export async function assertCoachOwnsClient(
  coachUserId: string,
  clientId: string,
): Promise<boolean> {
  const count = await prisma.client.count({
    where: {
      id: clientId,
      coachId: coachUserId,
    },
  });
  return count > 0;
}

export async function getOwnedCoachingSession(
  ownerUserId: string,
  coachingSessionId: string,
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
  messageId: string,
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

export async function getLatestClientReport(
  clientId: string
): Promise<ClientReport | null> {
  const report = await prisma.clientReport.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  if (!report) {
    return null;
  }
  return {
    id: report.id,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  };
}

export async function listClientReports(
  clientId: string,
  limit = 5
): Promise<ClientReport[]> {
  const reports = await prisma.clientReport.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return reports.map((report) => ({
    id: report.id,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  }));
}

export async function saveClientReport(
  clientId: string,
  content: string
): Promise<ClientReport> {
  const report = await prisma.clientReport.create({
    data: {
      clientId,
      content,
    },
  });
  return {
    id: report.id,
    content: report.content,
    createdAt: report.createdAt.toISOString(),
  };
}

export async function updateClientProfile(
  clientId: string,
  data: {
    name?: string;
    focusArea?: string;
    summary?: string;
    goals?: string[];
    coachId?: string | null;
  }
): Promise<ClientProfile> {
  const updateData: Prisma.ClientUpdateInput = {
    ...(data.name ? { name: data.name } : {}),
    ...(data.focusArea ? { focusArea: data.focusArea } : {}),
    ...(data.summary ? { summary: data.summary } : {}),
    ...(data.coachId !== undefined ? { coachId: data.coachId || null } : {}),
  };

  if (data.goals) {
    updateData.goals = {
      deleteMany: {},
      create: data.goals
        .filter((goal) => goal.trim().length > 0)
        .map((goal) => ({ value: goal.trim() })),
    };
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: updateData,
    include: { goals: true },
  });
  return mapClientProfile(client);
}

export async function createClient(data: {
  name: string;
  focusArea?: string;
  summary?: string;
  goals?: string[];
  avatarUrl?: string | null;
  coachId?: string | null;
}): Promise<ClientProfile> {
  const client = await prisma.client.create({
    data: {
      name: data.name.trim(),
      focusArea: data.focusArea?.trim() ?? "",
      summary: data.summary?.trim() ?? "",
      avatarUrl: data.avatarUrl ?? null,
      coachId: data.coachId ?? null,
      goals: data.goals?.length
        ? {
            create: data.goals
              .filter((goal) => goal.trim().length > 0)
              .map((goal) => ({ value: goal.trim() })),
          }
        : undefined,
    },
    include: { goals: true },
  });

  return mapClientProfile(client);
}

export async function updateClientAvatar(
  clientId: string,
  avatarUrl: string
): Promise<ClientProfile> {
  const client = await prisma.client.update({
    where: { id: clientId },
    data: { avatarUrl },
    include: { goals: true },
  });

  return mapClientProfile(client);
}

export async function updateUserProfile(
  userId: string,
  data: {
    name?: string;
    image?: string;
    avatarAlt?: string;
  }
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return user;
}

export type MessageSource = "AI" | "HUMAN";

export async function appendClientMessage(
  userId: string,
  clientId: string,
  role: AgentRole,
  content: string,
  meta?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
  source: MessageSource = "AI",
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
  limit = 12,
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
  },
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
  limit = 20,
): Promise<AgentMessage[]> {
  const messages = await prisma.overseerMessage.findMany({
    where: { coachUserId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse().map(mapOverseerMessage);
}

export async function getClientDigest(
  clientId: string,
  ownerUserId?: string,
): Promise<string> {
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
        ...(ownerUserId ? { ownerUserId } : {}),
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

export async function listClientDigestsForCoach(
  coachUserId: string,
): Promise<string[]> {
  const clients = await prisma.client.findMany({
    where: { coachId: coachUserId },
    select: { id: true },
  });

  const digests = await Promise.all(
    clients.map((client) => getClientDigest(client.id, coachUserId)),
  );

  return digests.filter((digest) => Boolean(digest));
}

type ClientWithGoals = Prisma.ClientGetPayload<{
  include: { goals: true };
}>;

function mapClientProfile(client: ClientWithGoals): ClientProfile {
  return {
    id: client.id,
    name: client.name,
    focusArea: client.focusArea,
    summary: client.summary,
    goals: client.goals.map((goal) => goal.value),
    avatarUrl: client.avatarUrl,
    coachId: client.coachId,
  };
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
  kind?: DocumentKind;
  audioDuration?: number;
}): Promise<ClientDocument> {
  const document = await prisma.clientDocument.create({
    data: {
      clientId: input.clientId,
      originalName: input.originalName,
      storedName: input.storedName,
      mimeType: input.mimeType,
      size: input.size,
      content: input.content,
      kind: input.kind ?? "TEXT",
      audioDuration: input.audioDuration,
    },
  });

  return mapDocument(document);
}

export async function getClientDocumentById(
  documentId: string,
): Promise<ClientDocumentWithClient | null> {
  const document = await prisma.clientDocument.findUnique({
    where: { id: documentId },
  });
  if (!document) {
    return null;
  }
  return mapDocumentWithClient(document);
}

export async function deleteClientDocumentById(
  documentId: string,
): Promise<ClientDocumentWithClient | null> {
  try {
    const document = await prisma.clientDocument.delete({
      where: { id: documentId },
    });
    return mapDocumentWithClient(document);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }
    throw error;
  }
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

  return documents.map((doc) => {
    const body = doc.content ?? "Geen transcript beschikbaar.";
    const content =
      DOCUMENT_SNIPPET_MAX_CHARS > 0
        ? body.slice(0, DOCUMENT_SNIPPET_MAX_CHARS)
        : body;
    return `Document (${doc.kind}): ${doc.originalName}\nGeüpload op: ${doc.createdAt.toISOString()}${
      doc.kind === "AUDIO" && doc.audioDuration
        ? `\nLengte audio: ${doc.audioDuration?.toFixed(1)}s`
        : ""
    }\nInhoud:\n${content}`;
  });
}

export interface SystemPromptRecord {
  content: string;
  updatedAt: string;
}

export interface PromptMutationResult {
  prompt: SystemPromptRecord;
  action: "create" | "update";
  oldLength: number | null;
  newLength: number;
}

export interface AgentFeedbackRecord {
  id: string;
  agentType: AgentKind;
  messageId: string;
  messageContent: string;
  feedback: string;
  createdAt: string;
  createdBy?: {
    id: string;
    name?: string | null;
  } | null;
}

async function getPromptRecord(id: string): Promise<SystemPromptRecord | null> {
  const prompt = await prisma.systemPrompt.findUnique({
    where: { id },
  });

  if (!prompt) {
    return null;
  }

  return {
    content: prompt.content,
    updatedAt: prompt.updatedAt.toISOString(),
  };
}

export async function getCoachPrompt(): Promise<SystemPromptRecord | null> {
  return getPromptRecord(COACH_PROMPT_ID);
}

export async function updatePrompt(
  promptKey: PromptKey,
  newContent: string,
  actorUserId: string,
  requestId?: string,
  ip?: string,
): Promise<PromptMutationResult> {
  const promptId = PROMPT_ID_BY_KEY[promptKey];

  return prisma.$transaction(async (tx) => {
    const previous = await tx.systemPrompt.findUnique({
      where: { id: promptId },
    });
    const action: "create" | "update" = previous ? "update" : "create";
    const oldLength = previous?.content.length ?? null;
    const oldHash = previous ? sha256(previous.content) : null;
    const newLength = newContent.length;
    const newHash = sha256(newContent);

    const saved = await tx.systemPrompt.upsert({
      where: { id: promptId },
      update: { content: newContent },
      create: { id: promptId, content: newContent },
    });

    await tx.promptAudit.create({
      data: {
        actorUserId,
        promptKey,
        action,
        oldHash,
        newHash,
        oldLength,
        newLength,
        requestId: requestId ?? null,
        ip: ip ?? null,
      },
    });

    return {
      prompt: {
        content: saved.content,
        updatedAt: saved.updatedAt.toISOString(),
      },
      action,
      oldLength,
      newLength,
    };
  });
}

export async function updateCoachPrompt(
  content: string,
  actorUserId: string,
  requestId?: string,
  ip?: string,
): Promise<PromptMutationResult> {
  return updatePrompt("coach", content, actorUserId, requestId, ip);
}

export async function getOverseerPrompt(): Promise<SystemPromptRecord | null> {
  return getPromptRecord(OVERSEER_PROMPT_ID);
}

export async function updateOverseerPrompt(
  content: string,
  actorUserId: string,
  requestId?: string,
  ip?: string,
): Promise<PromptMutationResult> {
  return updatePrompt("overseer", content, actorUserId, requestId, ip);
}

export async function getReportPrompt(): Promise<SystemPromptRecord | null> {
  return getPromptRecord(REPORT_PROMPT_ID);
}

export async function updateReportPrompt(
  content: string,
  actorUserId: string,
  requestId?: string,
  ip?: string,
): Promise<PromptMutationResult> {
  return updatePrompt("report", content, actorUserId, requestId, ip);
}

export async function getAgentMessageById(
  messageId: string,
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
  coachUserId: string,
): Promise<StoredAgentMessage | null> {
  const record = await prisma.overseerMessage.findFirst({
    where: {
      id: messageId,
      coachUserId,
    },
  });

  if (!record) {
    return null;
  }

  return mapOverseerMessage(record);
}

function mapSettings(records: Array<{ id: string; value: string }>): Record<string, string> {
  return records.reduce<Record<string, string>>((acc, record) => {
    acc[record.id] = record.value;
    return acc;
  }, {});
}

async function upsertSystemSetting(id: string, value: string) {
  await prisma.systemSetting.upsert({
    where: { id },
    update: { value },
    create: { id, value },
  });
}

export async function getAIModelSettings(): Promise<{
  coachModel: string;
  overseerModel: string;
}> {
  const settings = mapSettings(
    await prisma.systemSetting.findMany({
      where: {
        id: {
          in: [COACH_MODEL_SETTING_ID, OVERSEER_MODEL_SETTING_ID],
        },
      },
    }),
  );

  return {
    coachModel: settings[COACH_MODEL_SETTING_ID] ?? DEFAULT_COACH_MODEL,
    overseerModel: settings[OVERSEER_MODEL_SETTING_ID] ?? DEFAULT_OVERSEER_MODEL,
  };
}

export async function updateAIModelSettings(input: {
  coachModel?: string;
  overseerModel?: string;
}) {
  const tasks: Array<Promise<void>> = [];

  if (typeof input.coachModel === "string" && input.coachModel.trim().length) {
    tasks.push(upsertSystemSetting(COACH_MODEL_SETTING_ID, input.coachModel.trim()));
  }

  if (typeof input.overseerModel === "string" && input.overseerModel.trim().length) {
    tasks.push(
      upsertSystemSetting(OVERSEER_MODEL_SETTING_ID, input.overseerModel.trim()),
    );
  }

  if (tasks.length === 0) {
    throw new Error("Geen geldige modellen opgegeven.");
  }

  await Promise.all(tasks);

  return getAIModelSettings();
}

type PrismaAiResponseLayer = Prisma.AiResponseLayerGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    instructions: true;
    target: true;
    mode: true;
    model: true;
    temperature: true;
    position: true;
    isEnabled: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

function mapAiResponseLayer(record: PrismaAiResponseLayer): AIResponseLayerRecord {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    instructions: record.instructions,
    target: record.target,
    mode: record.mode,
    model: record.model,
    temperature: record.temperature,
    position: record.position,
    isEnabled: record.isEnabled,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function normalizeLayerText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeLayerTemperature(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.2;
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0.2;
  }
  return Math.min(1.2, Math.max(0, normalized));
}

async function getNextLayerPosition() {
  const record = await prisma.aiResponseLayer.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return typeof record?.position === "number" ? record.position + 1 : 1;
}

export async function listResponseLayers(): Promise<AIResponseLayerRecord[]> {
  const records = await prisma.aiResponseLayer.findMany({
    orderBy: [
      { position: "asc" },
      { createdAt: "asc" },
    ],
  });
  return records.map(mapAiResponseLayer);
}

export async function listActiveResponseLayers(
  agentType: AgentKind,
): Promise<AIResponseLayerRecord[]> {
  const targets: PrismaResponseLayerTarget[] = [
    PrismaResponseLayerTarget.ALL,
    agentType === AgentKind.COACH
      ? PrismaResponseLayerTarget.COACH
      : PrismaResponseLayerTarget.OVERSEER,
  ];

  const records = await prisma.aiResponseLayer.findMany({
    where: {
      isEnabled: true,
      target: { in: targets },
    },
    orderBy: [
      { position: "asc" },
      { createdAt: "asc" },
    ],
  });

  return records.map(mapAiResponseLayer);
}

export async function createResponseLayer(input: {
  name: string;
  description: string;
  instructions: string;
  model: string;
  target?: ResponseLayerTarget;
  mode?: ResponseLayerMode;
  temperature?: number;
  position?: number;
  isEnabled?: boolean;
}): Promise<AIResponseLayerRecord> {
  const name = normalizeLayerText(input.name);
  const description = normalizeLayerText(input.description);
  const instructions = normalizeLayerText(input.instructions);
  const model = normalizeLayerText(input.model);

  if (!name || !description || !instructions || !model) {
    throw new Error("Naam, beschrijving, instructies en model zijn verplicht.");
  }

  const position =
    typeof input.position === "number" && Number.isFinite(input.position)
      ? Math.max(0, Math.floor(input.position))
      : await getNextLayerPosition();

  const record = await prisma.aiResponseLayer.create({
    data: {
      name,
      description,
      instructions,
      model,
      target: input.target ?? PrismaResponseLayerTarget.ALL,
      mode: input.mode ?? PrismaResponseLayerMode.REWRITE,
      temperature: normalizeLayerTemperature(input.temperature),
      position,
      isEnabled: typeof input.isEnabled === "boolean" ? input.isEnabled : true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      instructions: true,
      target: true,
      mode: true,
      model: true,
      temperature: true,
      position: true,
      isEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return mapAiResponseLayer(record);
}

export async function updateResponseLayer(
  layerId: string,
  input: {
    name?: string;
    description?: string;
    instructions?: string;
    model?: string;
    target?: ResponseLayerTarget;
    mode?: ResponseLayerMode;
    temperature?: number;
    position?: number;
    isEnabled?: boolean;
  },
): Promise<AIResponseLayerRecord> {
  const data: Prisma.AiResponseLayerUpdateInput = {};

  if (typeof input.name === "string") {
    const name = normalizeLayerText(input.name);
    if (name) {
      data.name = name;
    }
  }

  if (typeof input.description === "string") {
    const description = normalizeLayerText(input.description);
    if (description) {
      data.description = description;
    }
  }

  if (typeof input.instructions === "string") {
    const instructions = normalizeLayerText(input.instructions);
    if (instructions) {
      data.instructions = instructions;
    }
  }

  if (typeof input.model === "string") {
    const model = normalizeLayerText(input.model);
    if (model) {
      data.model = model;
    }
  }

  if (typeof input.target === "string") {
    data.target = input.target;
  }

  if (typeof input.mode === "string") {
    data.mode = input.mode;
  }

  if (typeof input.temperature === "number" && Number.isFinite(input.temperature)) {
    data.temperature = normalizeLayerTemperature(input.temperature);
  }

  if (typeof input.position === "number" && Number.isFinite(input.position)) {
    data.position = Math.max(0, Math.floor(input.position));
  }

  if (typeof input.isEnabled === "boolean") {
    data.isEnabled = input.isEnabled;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("Geen geldige velden om bij te werken.");
  }

  const record = await prisma.aiResponseLayer.update({
    where: { id: layerId },
    data,
    select: {
      id: true,
      name: true,
      description: true,
      instructions: true,
      target: true,
      mode: true,
      model: true,
      temperature: true,
      position: true,
      isEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return mapAiResponseLayer(record);
}

export async function deleteResponseLayer(layerId: string): Promise<void> {
  await prisma.aiResponseLayer.delete({
    where: { id: layerId },
  });
}

function mapAgentFeedback(record: {
  id: string;
  agentType: AgentKind;
  messageId: string;
  messageContent: string;
  feedback: string;
  createdAt: Date;
  createdBy?: {
    id: string;
    name: string | null;
  } | null;
}): AgentFeedbackRecord {
  return {
    id: record.id,
    agentType: record.agentType,
    messageId: record.messageId,
    messageContent: record.messageContent,
    feedback: record.feedback,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy
      ? {
          id: record.createdBy.id,
          name: record.createdBy.name,
        }
      : null,
  };
}

export async function createAgentFeedback(input: {
  agentType: AgentKind;
  messageId: string;
  messageContent: string;
  feedback: string;
  createdById?: string;
}): Promise<AgentFeedbackRecord> {
  const record = await prisma.agentFeedback.create({
    data: {
      agentType: input.agentType,
      messageId: input.messageId,
      messageContent: input.messageContent,
      feedback: input.feedback,
      createdById: input.createdById,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return mapAgentFeedback(record);
}

export async function listAgentFeedback(
  agentType?: AgentKind,
  limit = 20,
): Promise<AgentFeedbackRecord[]> {
  const records = await prisma.agentFeedback.findMany({
    where: agentType ? { agentType } : undefined,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return records.map(mapAgentFeedback);
}

function mapDocument(document: {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  kind: DocumentKind;
  audioDuration: number | null;
  content: string | null;
  clientId?: string;
}): ClientDocument {
  return {
    id: document.id,
    originalName: document.originalName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    kind: document.kind,
    audioDuration: document.audioDuration,
    createdAt: document.createdAt.toISOString(),
    content: document.content,
  };
}

function mapDocumentWithClient(
  document: PrismaClientDocument,
): ClientDocumentWithClient {
  return {
    ...mapDocument(document),
    clientId: document.clientId,
  };
}
