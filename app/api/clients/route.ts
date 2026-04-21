import type { UserRole } from "@prisma/client";

import { getServerSessionFromRequest } from "@/lib/auth";
import { isAdmin, isCoach } from "@/lib/authz";
import { createClient, getClients } from "@/lib/data/clients";
import { isCoachUser } from "@/lib/data/users";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients GET",
  });

  if (!session) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 401 });
  }

  const clients = await getClients({
    userId: session.user.id,
    role: session.user.role as UserRole,
  });
  return jsonWithRequestId(requestId, { clients });
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients POST",
  });

  if (!session) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 401 });
  }

  const user = { id: session.user.id, role: session.user.role };
  const admin = isAdmin(user);
  const coach = isCoach(user);

  if (!admin && !coach) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
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
    coachId?: string;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    return jsonWithRequestId(requestId, { error: "Naam is verplicht" }, { status: 400 });
  }

  let normalizedCoachId: string | null = null;
  if (admin) {
    if (typeof coachId === "string" && coachId.trim().length > 0) {
      const nextCoachId = coachId.trim();
      const coachExists = await isCoachUser(nextCoachId);
      if (!coachExists) {
        return jsonWithRequestId(
          requestId,
          { error: "Geselecteerde coach bestaat niet." },
          { status: 400 }
        );
      }
      normalizedCoachId = nextCoachId;
    }
  } else if (coach) {
    const requestedCoachId =
      typeof coachId === "string" ? coachId.trim() : null;
    if (requestedCoachId && requestedCoachId !== session.user.id) {
      return jsonWithRequestId(
        requestId,
        { error: "Coaches kunnen alleen coachees aan zichzelf koppelen." },
        { status: 403 }
      );
    }
    normalizedCoachId = session.user.id;
  }

  const normalizedGoals = Array.isArray(goals)
    ? goals.filter((goal) => typeof goal === "string" && goal.trim().length > 0)
    : [];

  const client = await createClient({
    name,
    managerName: typeof managerName === "string" ? managerName : "",
    focusArea: typeof focusArea === "string" ? focusArea : "",
    summary: typeof summary === "string" ? summary : "",
    goals: normalizedGoals,
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : undefined,
    coachId: normalizedCoachId,
  });

  return jsonWithRequestId(requestId, { client }, { status: 201 });
}
