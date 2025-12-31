import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { updateClientAvatar, updateClientProfile } from "@/lib/data/store";

export async function PATCH(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
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
    const client = await updateClientAvatar(params.clientId, avatarUrl);
    return NextResponse.json({ client });
  }

  if (!name && !focusArea && !summary && !goals) {
    return NextResponse.json(
      { error: "Geen wijzigingen doorgegeven" },
      { status: 400 }
    );
  }

  const updatedClient = await updateClientProfile(params.clientId, {
    name,
    focusArea,
    summary,
    goals,
  });

  return NextResponse.json({ client: updatedClient });
}
