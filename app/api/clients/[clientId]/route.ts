import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { assertCanAccessClient, ForbiddenError, isAdmin } from "@/lib/authz";
import { updateClientAvatar, updateClientProfile } from "@/lib/data/store";
import { isCoachUser } from "@/lib/data/users";

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const cookie = request.headers.get("cookie") ?? "";
  const session = await auth.api.getSession({
    headers: { cookie },
  });

  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
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
    return NextResponse.json(
      { error: "Client ID ontbreekt" },
      { status: 400 }
    );
  }

  if (!admin) {
    try {
      await assertCanAccessClient(user, clientId, {
        route: "/api/clients/[clientId]",
        clientId,
      });
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
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
    return NextResponse.json({ client });
  }

  const hasCoachUpdate = Object.prototype.hasOwnProperty.call(
    payload,
    "coachId"
  );

  if (!admin && hasCoachUpdate) {
    return NextResponse.json(
      { error: "Alleen admins mogen de coachtoewijzing wijzigen." },
      { status: 403 },
    );
  }

  let nextCoachId: string | null | undefined = undefined;
  if (hasCoachUpdate) {
    if (coachId === null || coachId === "") {
      nextCoachId = null;
    } else if (typeof coachId === "string") {
      const coachExists = await isCoachUser(coachId);
      if (!coachExists) {
        return NextResponse.json(
          { error: "Geselecteerde coach bestaat niet." },
          { status: 400 }
        );
      }
      nextCoachId = coachId;
    } else {
      return NextResponse.json(
        { error: "Ongeldige coachreferentie" },
        { status: 400 }
      );
    }
  }

  if (!name && !focusArea && !summary && !goals && !hasCoachUpdate) {
    return NextResponse.json(
      { error: "Geen wijzigingen doorgegeven" },
      { status: 400 }
    );
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

  return NextResponse.json({ client: updatedClient });
}
