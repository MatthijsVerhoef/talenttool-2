import { NextResponse } from "next/server";

import { findActiveInviteByToken } from "@/lib/data/users";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  if (!token) {
    return NextResponse.json({ error: "Uitnodiging ontbreekt" }, { status: 400 });
  }

  const invite = await findActiveInviteByToken(token);

  if (!invite) {
    return NextResponse.json(
      { error: "Uitnodiging niet gevonden of verlopen" },
      { status: 404 }
    );
  }

  return NextResponse.json({ invite });
}
