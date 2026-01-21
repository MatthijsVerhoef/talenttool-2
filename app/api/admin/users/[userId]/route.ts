import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { countAdmins, mapAdminUserSummary } from "@/lib/data/users";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{
    userId: string;
  }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json(
      { error: "Gebruiker ontbreekt." },
      { status: 400 }
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  }

  const nextRole = (payload as { role?: string }).role;
  if (!nextRole || !Object.values(UserRole).includes(nextRole as UserRole)) {
    return NextResponse.json(
      { error: "Ongeldige rol." },
      { status: 400 }
    );
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "Gebruiker niet gevonden." }, { status: 404 });
    }

    if (targetUser.role === "ADMIN" && nextRole !== "ADMIN") {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Er moet altijd minstens één admin blijven." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: nextRole as UserRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        image: true,
      },
    });

    return NextResponse.json({
      user: mapAdminUserSummary(updated),
    });
  } catch (error) {
    console.error("Admin role update failed", error);
    return NextResponse.json(
      { error: "Rol bijwerken is mislukt." },
      { status: 500 }
    );
  }
}
