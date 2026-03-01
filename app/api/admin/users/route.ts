import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listAdminUsers, listPendingInvites } from "@/lib/data/users";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const [users, invites] = await Promise.all([
    listAdminUsers(),
    listPendingInvites(),
  ]);

  return NextResponse.json({ users, invites });
}
