import { Prisma, ResponseLayerTarget } from "@prisma/client";

import { AVAILABLE_AI_MODELS } from "@/lib/agents/models";
import { SessionGuardError, requireAdminSession } from "@/lib/auth-guards";
import { deleteResponseLayer, updateResponseLayer } from "@/lib/data/layers";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

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
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const { layerId } = await params;

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonWithRequestId(session.requestId, { error: "Ongeldig verzoek." }, { status: 400 });
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
        return jsonWithRequestId(session.requestId, { error: "Onbekend model geselecteerd." }, { status: 400 });
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
      return jsonWithRequestId(session.requestId, { error: "Geen velden om bij te werken." }, { status: 400 });
    }

    const layer = await updateResponseLayer(layerId, updateData);
    return jsonWithRequestId(session.requestId, { layer });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    console.error("Layer update failed", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return jsonWithRequestId(requestId, { error: "AI-laag niet gevonden." }, { status: 404 });
    }
    return jsonWithRequestId(requestId, { error: (error as Error).message ?? "Bijwerken van AI-laag is mislukt." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const { layerId } = await params;
    await deleteResponseLayer(layerId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    console.error("Layer delete failed", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return jsonWithRequestId(requestId, { error: "AI-laag niet gevonden." }, { status: 404 });
    }
    return jsonWithRequestId(requestId, { error: "Verwijderen van AI-laag is mislukt." }, { status: 400 });
  }
}
