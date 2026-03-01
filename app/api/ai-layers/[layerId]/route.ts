import { NextResponse } from "next/server";
import { Prisma, ResponseLayerTarget } from "@prisma/client";

import { AVAILABLE_AI_MODELS } from "@/lib/agents/models";
import { auth } from "@/lib/auth";
import { deleteResponseLayer, updateResponseLayer } from "@/lib/data/store";

interface Params {
  params: Promise<{
    layerId: string;
  }>;
}

const TARGET_VALUES = new Set<ResponseLayerTarget>([
  "ALL",
  "COACH",
  "OVERSEER",
]);

function isAllowedModel(value?: string) {
  if (!value) {
    return false;
  }
  return AVAILABLE_AI_MODELS.some((option) => option.value === value);
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const { layerId } = await params;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const updateData: {
    name?: string;
    description?: string;
    instructions?: string;
    model?: string;
    target?: ResponseLayerTarget;
    temperature?: number;
    position?: number;
    isEnabled?: boolean;
  } = {};

  if (typeof payload.name === "string" && payload.name.trim().length > 0) {
    updateData.name = payload.name.trim();
  }

  if (
    typeof payload.description === "string" &&
    payload.description.trim().length > 0
  ) {
    updateData.description = payload.description.trim();
  }

  if (
    typeof payload.instructions === "string" &&
    payload.instructions.trim().length > 0
  ) {
    updateData.instructions = payload.instructions.trim();
  }

  if (typeof payload.model === "string" && payload.model.trim().length > 0) {
    const model = payload.model.trim();
    if (!isAllowedModel(model)) {
      return NextResponse.json(
        { error: "Onbekend model geselecteerd." },
        { status: 400 },
      );
    }
    updateData.model = model;
  }

  if (
    typeof payload.target === "string" &&
    TARGET_VALUES.has(payload.target as ResponseLayerTarget)
  ) {
    updateData.target = payload.target as ResponseLayerTarget;
  }

  const temperatureValue =
    typeof payload.temperature === "number"
      ? payload.temperature
      : typeof payload.temperature === "string" &&
          payload.temperature.trim().length > 0
        ? Number(payload.temperature)
        : undefined;
  if (typeof temperatureValue === "number" && !Number.isNaN(temperatureValue)) {
    updateData.temperature = temperatureValue;
  }

  const positionValue =
    typeof payload.position === "number"
      ? payload.position
      : typeof payload.position === "string" && payload.position.trim().length > 0
        ? Number(payload.position)
        : undefined;
  if (typeof positionValue === "number" && !Number.isNaN(positionValue)) {
    updateData.position = positionValue;
  }

  if (typeof payload.isEnabled === "boolean") {
    updateData.isEnabled = payload.isEnabled;
  } else if (typeof payload.isEnabled === "string") {
    updateData.isEnabled = payload.isEnabled === "true";
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "Geen velden om bij te werken." },
      { status: 400 },
    );
  }

  try {
    const layer = await updateResponseLayer(layerId, updateData);
    return NextResponse.json({ layer });
  } catch (error) {
    console.error("Layer update failed", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "AI-laag niet gevonden." }, { status: 404 });
    }
    return NextResponse.json(
      { error: (error as Error).message ?? "Bijwerken van AI-laag is mislukt." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const { layerId } = await params;
  try {
    await deleteResponseLayer(layerId);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Layer delete failed", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "AI-laag niet gevonden." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Verwijderen van AI-laag is mislukt." },
      { status: 400 },
    );
  }
}
