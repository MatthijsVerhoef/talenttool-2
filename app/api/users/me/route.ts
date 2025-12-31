import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data/store";

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { name, image, avatarAlt } = payload as {
    name?: string;
    image?: string;
    avatarAlt?: string;
  };

  const updated = await updateUserProfile(session.user.id, {
    name,
    image,
    avatarAlt,
  });

  return NextResponse.json({ user: updated });
}
