import { AVAILABLE_AI_MODELS } from "@/lib/agents/models";
import { SessionGuardError, requireAdminSession } from "@/lib/auth-guards";
import { getAIModelSettings, updateAIModelSettings } from "@/lib/data/settings";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

function isAllowedModel(value?: string) {
  if (!value) {
    return true;
  }
  return AVAILABLE_AI_MODELS.some((option) => option.value === value);
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const settings = await getAIModelSettings();
    return jsonWithRequestId(session.requestId, {
      ...settings,
      availableModels: AVAILABLE_AI_MODELS,
    });
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
      return jsonWithRequestId(session.requestId, { error: "Ongeldig verzoek" }, { status: 400 });
    }

    const { coachModel, overseerModel } = payload as {
      coachModel?: string;
      overseerModel?: string;
    };

    if (!coachModel && !overseerModel) {
      return jsonWithRequestId(session.requestId, { error: "Geen modellen doorgegeven." }, { status: 400 });
    }

    if (!isAllowedModel(coachModel) || !isAllowedModel(overseerModel)) {
      return jsonWithRequestId(session.requestId, { error: "Onbekend model geselecteerd." }, { status: 400 });
    }

    const updated = await updateAIModelSettings({ coachModel, overseerModel });
    return jsonWithRequestId(session.requestId, {
      ...updated,
      availableModels: AVAILABLE_AI_MODELS,
    });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    console.error("Model update failed", error);
    return jsonWithRequestId(requestId, { error: "Opslaan van modellen is mislukt." }, { status: 500 });
  }
}
