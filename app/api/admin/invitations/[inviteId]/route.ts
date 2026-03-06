import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { revokePendingInvite } from "@/lib/data/users";

interface RouteParams {
  params: Promise<{
    inviteId: string;
  }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const { inviteId } = await params;
  if (!inviteId) {
    return NextResponse.json(
      { error: "Uitnodiging ontbreekt." },
      { status: 400 }
    );
  }

  try {
    const revoked = await revokePendingInvite(inviteId);
    if (!revoked) {
      return NextResponse.json(
        { error: "Uitnodiging niet gevonden of al geaccepteerd." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invite revoke failed", error);
    return NextResponse.json(
      { error: "Uitnodiging intrekken is mislukt." },
      { status: 500 }
    );
  }
}

