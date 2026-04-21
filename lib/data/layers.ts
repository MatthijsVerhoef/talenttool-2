import {
  AgentKind,
  Prisma,
  ResponseLayerMode as PrismaResponseLayerMode,
  ResponseLayerTarget as PrismaResponseLayerTarget,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

function mapAiResponseLayer(
  record: PrismaAiResponseLayer
): AIResponseLayerRecord {
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
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return records.map(mapAiResponseLayer);
}

export async function listActiveResponseLayers(
  agentType: AgentKind
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
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
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
  }
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

  if (
    typeof input.temperature === "number" &&
    Number.isFinite(input.temperature)
  ) {
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
