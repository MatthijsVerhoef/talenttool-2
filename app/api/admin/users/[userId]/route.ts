import { UserRole } from "@prisma/client";

import { SessionGuardError, requireAdminSession } from "@/lib/auth-guards";
import { deleteFromBlobSafely } from "@/lib/blob";
import { countAdmins, mapAdminUserSummary } from "@/lib/data/users";
import { jsonWithRequestId } from "@/lib/http/response";
import { getRequestId } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{
    userId: string;
  }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const { userId } = await params;

    if (!userId) {
      return jsonWithRequestId(session.requestId, { error: "Gebruiker ontbreekt." }, { status: 400 });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return jsonWithRequestId(session.requestId, { error: "Ongeldig verzoek." }, { status: 400 });
    }

    const nextRole = (payload as { role?: string }).role;
    if (!nextRole || !Object.values(UserRole).includes(nextRole as UserRole)) {
      return jsonWithRequestId(session.requestId, { error: "Ongeldige rol." }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!targetUser) {
      return jsonWithRequestId(session.requestId, { error: "Gebruiker niet gevonden." }, { status: 404 });
    }

    if (targetUser.role === "ADMIN" && nextRole !== "ADMIN") {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        return jsonWithRequestId(
          session.requestId,
          { error: "Er moet altijd minstens één admin blijven." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: nextRole as UserRole },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        image: true,
      },
    });

    return jsonWithRequestId(session.requestId, { user: mapAdminUserSummary(updated) });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    console.error("Admin role update failed", error);
    return jsonWithRequestId(requestId, { error: "Rol bijwerken is mislukt." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const requestId = getRequestId(request);
  try {
    const session = await requireAdminSession(request, requestId);
    const { userId } = await params;

    if (!userId) {
      return jsonWithRequestId(session.requestId, { error: "Gebruiker ontbreekt." }, { status: 400 });
    }

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

      if (targetUser.id === session.userId) {
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
      return jsonWithRequestId(session.requestId, { error: "Gebruiker niet gevonden." }, { status: 404 });
    }

    if (result.status === "self_delete") {
      return jsonWithRequestId(
        session.requestId,
        { error: "Je kunt je eigen account niet verwijderen." },
        { status: 400 }
      );
    }

    if (result.status === "last_admin") {
      return jsonWithRequestId(
        session.requestId,
        { error: "Er moet altijd minstens één admin blijven." },
        { status: 400 }
      );
    }

    await deleteFromBlobSafely([
      result.image ?? "",
      result.companyLogoUrl ?? "",
    ]);

    return jsonWithRequestId(session.requestId, { success: true });
  } catch (error) {
    if (error instanceof SessionGuardError) {
      return jsonWithRequestId(error.requestId, { error: error.message }, { status: error.status });
    }
    console.error("Admin user delete failed", error);
    return jsonWithRequestId(requestId, { error: "Gebruiker verwijderen is mislukt." }, { status: 500 });
  }
}
