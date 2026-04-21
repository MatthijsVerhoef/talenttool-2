import { AgentKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
  limit = 20
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
