import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { updateClientAvatar, updateClientProfile } from "@/lib/data/store";

type RouteContext = {
  params: Promise<{
    clientId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

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

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { name, focusArea, summary, goals, avatarUrl } = payload as {
    name?: string;
    focusArea?: string;
    summary?: string;
    goals?: string[];
    avatarUrl?: string;
  };

  if (avatarUrl) {
    const client = await updateClientAvatar(clientId, avatarUrl);
    return NextResponse.json({ client });
  }

  if (!name && !focusArea && !summary && !goals) {
    return NextResponse.json(
      { error: "Geen wijzigingen doorgegeven" },
      { status: 400 }
    );
  }

  const updatedClient = await updateClientProfile(clientId, {
    name,
    focusArea,
    summary,
    goals,
  });

  return NextResponse.json({ client: updatedClient });
}
