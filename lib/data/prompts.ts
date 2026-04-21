import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/security/hash";

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

export type PromptKey = "coach" | "overseer" | "report";

const COACH_PROMPT_ID = "coach-role";
const OVERSEER_PROMPT_ID = "overseer-role";
const REPORT_PROMPT_ID = "report-role";

const PROMPT_ID_BY_KEY: Record<PromptKey, string> = {
  coach: COACH_PROMPT_ID,
  overseer: OVERSEER_PROMPT_ID,
  report: REPORT_PROMPT_ID,
};

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

export async function getOverseerPrompt(): Promise<SystemPromptRecord | null> {
  return getPromptRecord(OVERSEER_PROMPT_ID);
}

export async function getReportPrompt(): Promise<SystemPromptRecord | null> {
  return getPromptRecord(REPORT_PROMPT_ID);
}

export async function updatePrompt(
  promptKey: PromptKey,
  newContent: string,
  actorUserId: string,
  requestId?: string,
  ip?: string
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
  ip?: string
): Promise<PromptMutationResult> {
  return updatePrompt("coach", content, actorUserId, requestId, ip);
}

export async function updateOverseerPrompt(
  content: string,
  actorUserId: string,
  requestId?: string,
  ip?: string
): Promise<PromptMutationResult> {
  return updatePrompt("overseer", content, actorUserId, requestId, ip);
}

export async function updateReportPrompt(
  content: string,
  actorUserId: string,
  requestId?: string,
  ip?: string
): Promise<PromptMutationResult> {
  return updatePrompt("report", content, actorUserId, requestId, ip);
}
