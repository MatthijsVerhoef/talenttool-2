import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listCoaches } from "@/lib/data/users";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const coaches = await listCoaches();
  return NextResponse.json({ coaches });
}
