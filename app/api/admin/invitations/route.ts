import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  buildInviteUrl,
  createUserInvite,
} from "@/lib/data/users";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const email =
    typeof (payload as { email?: string }).email === "string"
      ? (payload as { email: string }).email.trim().toLowerCase()
      : "";

  if (!email) {
    return NextResponse.json(
      { error: "E-mailadres is verplicht" },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "Er bestaat al een gebruiker met dit e-mailadres." },
      { status: 409 }
    );
  }

  const invite = await createUserInvite({
    email,
    createdById: session.user.id,
  });

  const inviteUrl = buildInviteUrl(invite.token);

  return NextResponse.json(
    {
      invite,
      inviteUrl,
    },
    { status: 201 }
  );
}
