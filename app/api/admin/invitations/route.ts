import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  buildInviteUrl,
  createUserInvite,
} from "@/lib/data/users";
import { sendUserInviteEmail } from "@/lib/email/invitations";
import { getRequestId } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

function jsonWithRequestId(requestId: string, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("x-request-id", requestId);
  return response;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return jsonWithRequestId(
      requestId,
      { error: "Niet geautoriseerd" },
      { status: 403 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonWithRequestId(
      requestId,
      { error: "Ongeldig verzoek" },
      { status: 400 }
    );
  }

  const email =
    typeof (payload as { email?: string }).email === "string"
      ? (payload as { email: string }).email.trim().toLowerCase()
      : "";

  if (!email) {
    return jsonWithRequestId(
      requestId,
      { error: "E-mailadres is verplicht" },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return jsonWithRequestId(
      requestId,
      { error: "Er bestaat al een gebruiker met dit e-mailadres." },
      { status: 409 }
    );
  }

  const invite = await createUserInvite({
    email,
    createdById: session.user.id,
  });

  const inviteUrl = buildInviteUrl(invite.token);

  try {
    await sendUserInviteEmail({
      toEmail: email,
      inviteUrl,
      inviterName: session.user.name,
    });
  } catch (emailError) {
    return jsonWithRequestId(
      requestId,
      {
        error:
          emailError instanceof Error
            ? `Uitnodiging opgeslagen, maar e-mail versturen is mislukt: ${emailError.message}`
            : "Uitnodiging opgeslagen, maar e-mail versturen is mislukt.",
        invite,
        inviteUrl,
      },
      { status: 502 }
    );
  }

  return jsonWithRequestId(
    requestId,
    {
      invite,
      inviteUrl,
    },
    { status: 201 }
  );
}
