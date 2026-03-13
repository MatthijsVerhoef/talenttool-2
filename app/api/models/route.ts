import { NextResponse } from "next/server";

import { AVAILABLE_AI_MODELS } from "@/lib/agents/models";
import { auth } from "@/lib/auth";
import { getAIModelSettings, updateAIModelSettings } from "@/lib/data/store";

function isAllowedModel(value?: string) {
  if (!value) {
    return true;
  }
  return AVAILABLE_AI_MODELS.some((option) => option.value === value);
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const settings = await getAIModelSettings();

  return NextResponse.json({
    ...settings,
    availableModels: AVAILABLE_AI_MODELS,
  });
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
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { coachModel, overseerModel } = payload as {
    coachModel?: string;
    overseerModel?: string;
  };

  if (!coachModel && !overseerModel) {
    return NextResponse.json(
      { error: "Geen modellen doorgegeven." },
      { status: 400 },
    );
  }

  if (!isAllowedModel(coachModel) || !isAllowedModel(overseerModel)) {
    return NextResponse.json(
      { error: "Onbekend model geselecteerd." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateAIModelSettings({
      coachModel,
      overseerModel,
    });

    return NextResponse.json({
      ...updated,
      availableModels: AVAILABLE_AI_MODELS,
    });
  } catch (error) {
    console.error("Model update failed", error);
    return NextResponse.json(
      { error: "Opslaan van modellen is mislukt." },
      { status: 500 },
    );
  }
}
