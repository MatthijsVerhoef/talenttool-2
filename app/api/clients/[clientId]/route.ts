import { NextRequest } from "next/server";

import { getServerSessionFromRequest } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError, isAdmin } from "@/lib/authz";
import { deleteFromBlobSafely } from "@/lib/blob";
import {
  deleteClientById,
  getClient,
  updateClientAvatar,
  updateClientProfile,
} from "@/lib/data/clients";
import { isCoachUser } from "@/lib/data/users";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients/[clientId] PATCH",
  });

  if (!session) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 401 });
  }

  const user = { id: session.user.id, role: session.user.role };
  const admin = isAdmin(user);

  const payload = await request.json().catch(() => null);
  const params = await context.params;
  const clientId =
    params?.clientId ??
    (payload && typeof payload === "object"
      ? ((payload as { clientId?: string }).clientId ?? null)
      : null);

  if (!clientId) {
    return jsonWithRequestId(requestId, { error: "Client ID ontbreekt" }, { status: 400 });
  }

  if (!admin) {
    try {
      await assertCanAccessClient(user, clientId, {
        route: "/api/clients/[clientId]",
        clientId,
      });
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return jsonWithRequestId(requestId, { error: error.message }, { status: 403 });
      }
      throw error;
    }
  }

  if (!payload || typeof payload !== "object") {
    return jsonWithRequestId(requestId, { error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { name, managerName, focusArea, summary, goals, avatarUrl, coachId } = payload as {
    name?: string;
    managerName?: string;
    focusArea?: string;
    summary?: string;
    goals?: string[];
    avatarUrl?: string;
    coachId?: string | null;
  };

  if (avatarUrl) {
    const client = await updateClientAvatar(clientId, avatarUrl);
    return jsonWithRequestId(requestId, { client });
  }

  const hasCoachUpdate = Object.prototype.hasOwnProperty.call(
    payload,
    "coachId"
  );

  let shouldApplyCoachUpdate = hasCoachUpdate;

  let nextCoachId: string | null | undefined = undefined;
  if (hasCoachUpdate) {
    if (coachId === null || coachId === "") {
      nextCoachId = null;
    } else if (typeof coachId === "string") {
      const coachExists = await isCoachUser(coachId);
      if (!coachExists) {
        return jsonWithRequestId(
          requestId,
          { error: "Geselecteerde coach bestaat niet." },
          { status: 400 }
        );
      }
      nextCoachId = coachId;
    } else {
      return jsonWithRequestId(
        requestId,
        { error: "Ongeldige coachreferentie" },
        { status: 400 }
      );
    }
  }

  if (!admin && hasCoachUpdate) {
    const client = await getClient(clientId);
    if (!client) {
      return jsonWithRequestId(requestId, { error: "Coachee niet gevonden" }, { status: 404 });
    }

    if (nextCoachId !== (client.coachId ?? null)) {
      return jsonWithRequestId(
        requestId,
        { error: "Alleen admins mogen de coachtoewijzing wijzigen." },
        { status: 403 }
      );
    }

    shouldApplyCoachUpdate = false;
  }

  const hasManagerNameUpdate = Object.prototype.hasOwnProperty.call(
    payload,
    "managerName"
  );

  if (
    !name &&
    !managerName &&
    !focusArea &&
    !summary &&
    !goals &&
    !shouldApplyCoachUpdate &&
    !hasManagerNameUpdate
  ) {
    return jsonWithRequestId(requestId, { error: "Geen wijzigingen doorgegeven" }, { status: 400 });
  }

  const updatePayload: {
    name?: string;
    managerName?: string;
    focusArea?: string;
    summary?: string;
    goals?: string[];
    coachId?: string | null;
  } = {
    name,
    ...(hasManagerNameUpdate ? { managerName } : {}),
    focusArea,
    summary,
    goals,
  };

  if (shouldApplyCoachUpdate) {
    updatePayload.coachId = nextCoachId ?? null;
  }

  const updatedClient = await updateClientProfile(clientId, updatePayload);

  return jsonWithRequestId(requestId, { client: updatedClient });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients/[clientId] DELETE",
  });

  if (!session) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 401 });
  }

  const params = await context.params;
  const clientId = params?.clientId ?? null;

  if (!clientId) {
    return jsonWithRequestId(requestId, { error: "Client ID ontbreekt" }, { status: 400 });
  }

  try {
    await assertCanAccessClient(
      { id: session.user.id, role: session.user.role },
      clientId,
      {
        requestId,
        route: "/api/clients/[clientId]",
        clientId,
      }
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return jsonWithRequestId(requestId, { error: error.message }, { status: 403 });
    }
    throw error;
  }

  try {
    const deletedClient = await deleteClientById(clientId);

    if (!deletedClient) {
      return jsonWithRequestId(requestId, { error: "Coachee niet gevonden" }, { status: 404 });
    }

    await deleteFromBlobSafely([
      deletedClient.avatarUrl ?? "",
      ...deletedClient.documentUrls,
    ]);

    return jsonWithRequestId(requestId, { success: true });
  } catch (error) {
    console.error("Client delete failed", error);
    return jsonWithRequestId(
      requestId,
      { error: "Coachee verwijderen is mislukt." },
      { status: 500 }
    );
  }
}
