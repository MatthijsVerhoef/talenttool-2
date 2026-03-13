import { NextResponse } from "next/server";

import { getServerSessionFromRequest } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data/store";
import { getRequestId } from "@/lib/observability";
import { normalizeUserName } from "@/lib/user-name";

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

  const { name, firstName, lastName, image, avatarAlt, companyName, companyLogoUrl } = payload as {
    name?: string;
    firstName?: string;
    lastName?: string;
    image?: string;
    avatarAlt?: string;
    companyName?: string;
    companyLogoUrl?: string;
  };

  const hasNameInput =
    typeof name === "string" ||
    typeof firstName === "string" ||
    typeof lastName === "string";
  const normalizedName = normalizeUserName({
    name,
    firstName,
    lastName,
  });

  if (hasNameInput && !normalizedName) {
    const response = jsonNoStore({ error: "Naam is verplicht" }, { status: 400 });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (
    session.user.role === "COACH" &&
    typeof companyName === "string" &&
    !companyName.trim()
  ) {
    const response = jsonNoStore(
      { error: "Bedrijfsnaam is verplicht" },
      { status: 400 }
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const updated = await updateUserProfile(session.user.id, {
    ...(hasNameInput ? { name: normalizedName } : {}),
    image,
    avatarAlt,
    ...(typeof companyName === "string"
      ? { companyName: companyName.trim() || null }
      : {}),
    ...(typeof companyLogoUrl === "string"
      ? { companyLogoUrl: companyLogoUrl.trim() || null }
      : {}),
  });

  const response = jsonNoStore({ user: updated });
  response.headers.set("x-request-id", requestId);
  return response;
}
