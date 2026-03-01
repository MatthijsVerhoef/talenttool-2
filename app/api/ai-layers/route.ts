import { NextResponse } from "next/server";
import { Prisma, ResponseLayerTarget } from "@prisma/client";

import { AVAILABLE_AI_MODELS } from "@/lib/agents/models";
import { auth } from "@/lib/auth";
import { createResponseLayer, listResponseLayers } from "@/lib/data/store";

function isAllowedModel(value?: string) {
  if (!value) {
    return false;
  }
  return AVAILABLE_AI_MODELS.some((option) => option.value === value);
}

const TARGET_VALUES = new Set<ResponseLayerTarget>([
  "ALL",
  "COACH",
  "OVERSEER",
]);

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const layers = await listResponseLayers();
  return NextResponse.json({ layers });
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

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";
  const instructions =
    typeof payload.instructions === "string" ? payload.instructions.trim() : "";
  const model = typeof payload.model === "string" ? payload.model.trim() : "";

  if (!name || !description || !instructions || !model) {
    return NextResponse.json(
      { error: "Naam, beschrijving, instructies en model zijn verplicht." },
      { status: 400 },
    );
  }

  if (!isAllowedModel(model)) {
    return NextResponse.json(
      { error: "Onbekend model geselecteerd." },
      { status: 400 },
    );
  }

  const target =
    typeof payload.target === "string" && TARGET_VALUES.has(payload.target as ResponseLayerTarget)
      ? (payload.target as ResponseLayerTarget)
      : undefined;

  const temperature =
    typeof payload.temperature === "number"
      ? payload.temperature
      : typeof payload.temperature === "string" && payload.temperature.trim().length
        ? Number(payload.temperature)
        : undefined;

  const position =
    typeof payload.position === "number"
      ? payload.position
      : typeof payload.position === "string" && payload.position.trim().length
        ? Number(payload.position)
        : undefined;

  const isEnabled =
    typeof payload.isEnabled === "boolean"
      ? payload.isEnabled
      : typeof payload.isEnabled === "string"
        ? payload.isEnabled === "true"
        : undefined;

  try {
    const layer = await createResponseLayer({
      name,
      description,
      instructions,
      model,
      target,
      temperature,
      position,
      isEnabled,
    });

    return NextResponse.json({ layer });
  } catch (error) {
    console.error("Layer creation failed", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Opslaan van AI-laag is mislukt." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: (error as Error).message ?? "Opslaan van AI-laag is mislukt." },
      { status: 400 },
    );
  }
}
