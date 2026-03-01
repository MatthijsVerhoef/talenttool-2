import { NextResponse } from "next/server";

import type { UserRole } from "@prisma/client";

import { getServerSessionFromRequest } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { createClient, getClients } from "@/lib/data/store";
import { isCoachUser } from "@/lib/data/users";
import { getRequestId } from "@/lib/observability";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients GET",
  });

  if (!session) {
    const response = jsonNoStore({ error: "Niet geautoriseerd" }, { status: 401 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const clients = await getClients({
    userId: session.user.id,
    role: session.user.role as UserRole,
  });
  const response = jsonNoStore({ clients });
  response.headers.set("x-request-id", requestId);
  return response;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/clients POST",
  });

  if (!session) {
    const response = jsonNoStore({ error: "Niet geautoriseerd" }, { status: 401 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (!isAdmin({ id: session.user.id, role: session.user.role })) {
    const response = jsonNoStore({ error: "Niet geautoriseerd" }, { status: 403 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const payload = await request.json().catch(() => null);
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
    coachId?: string;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    const response = jsonNoStore({ error: "Naam is verplicht" }, { status: 400 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  let normalizedCoachId: string | null = null;
  if (typeof coachId === "string" && coachId.trim().length > 0) {
    const coachExists = await isCoachUser(coachId);
    if (!coachExists) {
      const response = jsonNoStore(
        { error: "Geselecteerde coach bestaat niet." },
        { status: 400 }
      );
      response.headers.set("x-request-id", requestId);
      return response;
    }
    normalizedCoachId = coachId;
  }

  const normalizedGoals = Array.isArray(goals)
    ? goals.filter((goal) => typeof goal === "string" && goal.trim().length > 0)
    : [];

  const client = await createClient({
    name,
    focusArea: typeof focusArea === "string" ? focusArea : "",
    summary: typeof summary === "string" ? summary : "",
    goals: normalizedGoals,
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : undefined,
    coachId: normalizedCoachId,
  });

  const response = jsonNoStore({ client }, { status: 201 });
  response.headers.set("x-request-id", requestId);
  return response;
}
