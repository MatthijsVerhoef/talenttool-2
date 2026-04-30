import {
  DEFAULT_COACH_MODEL,
  DEFAULT_OVERSEER_MODEL,
} from "@/lib/agents/models";
import { prisma } from "@/lib/prisma";

const COACH_MODEL_SETTING_ID = "coach-model";
const OVERSEER_MODEL_SETTING_ID = "overseer-model";

function mapSettings(
  records: Array<{ id: string; value: string }>
): Record<string, string> {
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
    })
  );

  return {
    coachModel: settings[COACH_MODEL_SETTING_ID] ?? DEFAULT_COACH_MODEL,
    overseerModel:
      settings[OVERSEER_MODEL_SETTING_ID] ?? DEFAULT_OVERSEER_MODEL,
  };
}

export async function updateAIModelSettings(input: {
  coachModel?: string;
  overseerModel?: string;
}) {
  const tasks: Array<Promise<void>> = [];

  if (typeof input.coachModel === "string" && input.coachModel.trim().length) {
    tasks.push(
      upsertSystemSetting(COACH_MODEL_SETTING_ID, input.coachModel.trim())
    );
  }

  if (
    typeof input.overseerModel === "string" &&
    input.overseerModel.trim().length
  ) {
    tasks.push(
      upsertSystemSetting(OVERSEER_MODEL_SETTING_ID, input.overseerModel.trim())
    );
  }

  if (tasks.length === 0) {
    throw new Error("Geen geldige modellen opgegeven.");
  }

  await Promise.all(tasks);

  return getAIModelSettings();
}
