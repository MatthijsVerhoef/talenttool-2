import { getServerSessionFromRequest } from "@/lib/auth";
import { updateUserProfile } from "@/lib/data/users";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";
import { normalizeUserName } from "@/lib/user-name";

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId,
    source: "/api/users/me",
  });

  if (!session) {
    return jsonWithRequestId(requestId, { error: "Niet geautoriseerd" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return jsonWithRequestId(requestId, { error: "Ongeldig verzoek" }, { status: 400 });
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
    return jsonWithRequestId(requestId, { error: "Naam is verplicht" }, { status: 400 });
  }

  if (
    session.user.role === "COACH" &&
    typeof companyName === "string" &&
    !companyName.trim()
  ) {
    return jsonWithRequestId(requestId, { error: "Bedrijfsnaam is verplicht" }, { status: 400 });
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

  return jsonWithRequestId(requestId, { user: updated });
}
