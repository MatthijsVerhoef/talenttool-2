import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

import { auth } from "@/lib/auth";
import { deleteFromBlobSafely } from "@/lib/blob";
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

export async function DELETE(request: Request, { params }: RouteParams) {
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          image: true,
          companyLogoUrl: true,
        },
      });

      if (!targetUser) {
        return { status: "not_found" as const };
      }

      if (targetUser.id === session.user.id) {
        return { status: "self_delete" as const };
      }

      if (targetUser.role === "ADMIN") {
        const adminCount = await tx.user.count({
          where: { role: "ADMIN" },
        });

        if (adminCount <= 1) {
          return { status: "last_admin" as const };
        }
      }

      await tx.user.delete({
        where: { id: userId },
      });

      return {
        status: "deleted" as const,
        image: targetUser.image ?? null,
        companyLogoUrl: targetUser.companyLogoUrl ?? null,
      };
    });

    if (result.status === "not_found") {
      return NextResponse.json(
        { error: "Gebruiker niet gevonden." },
        { status: 404 }
      );
    }

    if (result.status === "self_delete") {
      return NextResponse.json(
        { error: "Je kunt je eigen account niet verwijderen." },
        { status: 400 }
      );
    }

    if (result.status === "last_admin") {
      return NextResponse.json(
        { error: "Er moet altijd minstens één admin blijven." },
        { status: 400 }
      );
    }

    await deleteFromBlobSafely([
      result.image ?? "",
      result.companyLogoUrl ?? "",
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin user delete failed", error);
    return NextResponse.json(
      { error: "Gebruiker verwijderen is mislukt." },
      { status: 500 }
    );
  }
}
