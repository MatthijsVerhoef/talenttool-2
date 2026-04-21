import { Prisma, UserRole } from "@prisma/client";

import { scopedClientWhere } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export interface ClientProfile {
  id: string;
  name: string;
  managerName?: string | null;
  focusArea: string;
  summary: string;
  goals: string[];
  avatarUrl?: string | null;
  coachId?: string | null;
}

type ClientWithGoals = Prisma.ClientGetPayload<{
  include: { goals: true };
}>;

function mapClientProfile(client: ClientWithGoals): ClientProfile {
  return {
    id: client.id,
    name: client.name,
    managerName: client.managerName,
    focusArea: client.focusArea,
    summary: client.summary,
    goals: client.goals.map((goal) => goal.value),
    avatarUrl: client.avatarUrl,
    coachId: client.coachId,
  };
}

export async function getClients(options?: {
  userId?: string;
  role?: UserRole;
}): Promise<ClientProfile[]> {
  if (!options?.userId || !options.role) {
    return [];
  }

  const clients = await prisma.client.findMany({
    where: scopedClientWhere({
      id: options.userId,
      role: options.role,
    }),
    include: {
      goals: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return clients.map(mapClientProfile);
}

export async function getClient(
  clientId: string
): Promise<ClientProfile | null> {
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
  clientId: string
): Promise<boolean> {
  const count = await prisma.client.count({
    where: {
      id: clientId,
      coachId: coachUserId,
    },
  });
  return count > 0;
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

export async function updateClientProfile(
  clientId: string,
  data: {
    name?: string;
    managerName?: string;
    focusArea?: string;
    summary?: string;
    goals?: string[];
    coachId?: string | null;
  }
): Promise<ClientProfile> {
  const updateData: Prisma.ClientUpdateInput = {
    ...(data.name ? { name: data.name } : {}),
    ...(data.managerName !== undefined
      ? { managerName: data.managerName.trim() || null }
      : {}),
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
  managerName?: string;
  focusArea?: string;
  summary?: string;
  goals?: string[];
  avatarUrl?: string | null;
  coachId?: string | null;
}): Promise<ClientProfile> {
  const client = await prisma.client.create({
    data: {
      name: data.name.trim(),
      managerName: data.managerName?.trim() || null,
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

export async function deleteClientById(clientId: string): Promise<{
  avatarUrl: string | null;
  documentUrls: string[];
} | null> {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        avatarUrl: true,
        documents: {
          select: {
            storedName: true,
          },
        },
      },
    });

    if (!client) {
      return null;
    }

    await tx.client.delete({
      where: { id: clientId },
    });

    return {
      avatarUrl: client.avatarUrl ?? null,
      documentUrls: client.documents
        .map((document) => document.storedName)
        .filter((value) => value.trim().length > 0),
    };
  });
}

export async function getClientDigest(
  clientId: string,
  ownerUserId?: string
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
    `Coachee: ${client.name}`,
    `Focus: ${client.focusArea}`,
    `Doelen: ${
      client.goals.map((goal) => goal.value).join("; ") || "Geen doelen bekend"
    }`,
    `Laatste coachnotitie: ${latestAssistant?.content ?? "Nog geen notities."}`,
  ].join("\n");
}

export async function listClientDigests(): Promise<string[]> {
  const clients = await prisma.client.findMany({
    select: { id: true },
  });

  const digests = await Promise.all(
    clients.map((client) => getClientDigest(client.id))
  );

  return digests.filter((digest) => Boolean(digest));
}

export async function listClientDigestsForCoach(
  coachUserId: string
): Promise<string[]> {
  const clients = await prisma.client.findMany({
    where: { coachId: coachUserId },
    select: { id: true },
  });

  const digests = await Promise.all(
    clients.map((client) => getClientDigest(client.id, coachUserId))
  );

  return digests.filter((digest) => Boolean(digest));
}
