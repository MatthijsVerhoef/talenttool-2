import { NextRequest, NextResponse } from "next/server";

import { getServerSessionFromRequest } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError, isAdmin } from "@/lib/authz";
import { updateClientAvatar, updateClientProfile } from "@/lib/data/store";
import { isCoachUser } from "@/lib/data/users";
import { getRequestId } from "@/lib/observability";

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients/[clientId] PATCH",
  });

  if (!session) {
    const response = jsonNoStore({ error: "Niet geautoriseerd" }, { status: 401 });
    response.headers.set("x-request-id", requestId);
    return response;
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
    const response = jsonNoStore(
      { error: "Client ID ontbreekt" },
      { status: 400 }
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (!admin) {
    try {
      await assertCanAccessClient(user, clientId, {
        route: "/api/clients/[clientId]",
        clientId,
      });
    } catch (error) {
      if (error instanceof ForbiddenError) {
        const response = jsonNoStore({ error: error.message }, { status: 403 });
        response.headers.set("x-request-id", requestId);
        return response;
      }
      throw error;
    }
  }

  if (!payload || typeof payload !== "object") {
    const response = jsonNoStore({ error: "Ongeldig verzoek" }, { status: 400 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const { name, focusArea, summary, goals, avatarUrl, coachId } = payload as {
    name?: string;
    focusArea?: string;
    summary?: string;
    goals?: string[];
    avatarUrl?: string;
    coachId?: string | null;
  };

  if (avatarUrl) {
    const client = await updateClientAvatar(clientId, avatarUrl);
    const response = jsonNoStore({ client });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const hasCoachUpdate = Object.prototype.hasOwnProperty.call(
    payload,
    "coachId"
  );

  if (!admin && hasCoachUpdate) {
    const response = jsonNoStore(
      { error: "Alleen admins mogen de coachtoewijzing wijzigen." },
      { status: 403 },
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }

  let nextCoachId: string | null | undefined = undefined;
  if (hasCoachUpdate) {
    if (coachId === null || coachId === "") {
      nextCoachId = null;
    } else if (typeof coachId === "string") {
      const coachExists = await isCoachUser(coachId);
      if (!coachExists) {
        const response = jsonNoStore(
          { error: "Geselecteerde coach bestaat niet." },
          { status: 400 }
        );
        response.headers.set("x-request-id", requestId);
        return response;
      }
      nextCoachId = coachId;
    } else {
      const response = jsonNoStore(
        { error: "Ongeldige coachreferentie" },
        { status: 400 }
      );
      response.headers.set("x-request-id", requestId);
      return response;
    }
  }

  if (!name && !focusArea && !summary && !goals && !hasCoachUpdate) {
    const response = jsonNoStore(
      { error: "Geen wijzigingen doorgegeven" },
      { status: 400 }
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const updatePayload: {
    name?: string;
    focusArea?: string;
    summary?: string;
    goals?: string[];
    coachId?: string | null;
  } = {
    name,
    focusArea,
    summary,
    goals,
  };

  if (hasCoachUpdate) {
    updatePayload.coachId = nextCoachId ?? null;
  }

  const updatedClient = await updateClientProfile(clientId, updatePayload);

  const response = jsonNoStore({ client: updatedClient });
  response.headers.set("x-request-id", requestId);
  return response;
}
