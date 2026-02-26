import { NextResponse } from "next/server";

import type { UserRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { createClient, getClients } from "@/lib/data/store";
import { isCoachUser } from "@/lib/data/users";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const session = await auth.api.getSession({
    headers: { cookie },
  });

  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const clients = await getClients({
    userId: session.user.id,
    role: session.user.role as UserRole,
  });
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const session = await auth.api.getSession({
    headers: { cookie },
  });

  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  if (!isAdmin({ id: session.user.id, role: session.user.role })) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
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
    return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });
  }

  let normalizedCoachId: string | null = null;
  if (typeof coachId === "string" && coachId.trim().length > 0) {
    const coachExists = await isCoachUser(coachId);
    if (!coachExists) {
      return NextResponse.json(
        { error: "Geselecteerde coach bestaat niet." },
        { status: 400 }
      );
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

  return NextResponse.json({ client }, { status: 201 });
}
