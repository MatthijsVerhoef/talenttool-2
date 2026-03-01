import { NextResponse } from "next/server";

import { getServerSessionFromRequest } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data/store";
import { getRequestId } from "@/lib/observability";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/users/me",
  });

  if (!session) {
    const response = jsonNoStore({ error: "Niet geautoriseerd" }, { status: 401 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    const response = jsonNoStore({ error: "Ongeldig verzoek" }, { status: 400 });
    response.headers.set("x-request-id", requestId);
    return response;
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

  const response = jsonNoStore({ user: updated });
  response.headers.set("x-request-id", requestId);
  return response;
}
