import { Prisma, ResponseLayerTarget } from "@prisma/client";

import { AVAILABLE_AI_MODELS } from "@/lib/agents/models";
import { SessionGuardError, requireAdminSession } from "@/lib/auth-guards";
import { createResponseLayer, listResponseLayers } from "@/lib/data/layers";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

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
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const layers = await listResponseLayers();
    return jsonWithRequestId(session.requestId, { layers });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonWithRequestId(session.requestId, { error: "Ongeldig verzoek." }, { status: 400 });
    }

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const description =
      typeof payload.description === "string" ? payload.description.trim() : "";
    const instructions =
      typeof payload.instructions === "string" ? payload.instructions.trim() : "";
    const model = typeof payload.model === "string" ? payload.model.trim() : "";

    if (!name || !description || !instructions || !model) {
      return jsonWithRequestId(
        session.requestId,
        { error: "Naam, beschrijving, instructies en model zijn verplicht." },
        { status: 400 }
      );
    }

    if (!isAllowedModel(model)) {
      return jsonWithRequestId(session.requestId, { error: "Onbekend model geselecteerd." }, { status: 400 });
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

    return jsonWithRequestId(session.requestId, { layer });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    console.error("Layer creation failed", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonWithRequestId(requestId, { error: "Opslaan van AI-laag is mislukt." }, { status: 400 });
    }
    return jsonWithRequestId(requestId, { error: (error as Error).message ?? "Opslaan van AI-laag is mislukt." }, { status: 400 });
  }
}
