import { Prisma, UserRole } from "@prisma/client";

import { logInfo } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

export interface AuthzUser {
  id: string;
  role: UserRole | string;
}

interface AuthzContext {
  requestId?: string;
  route?: string;
  clientId?: string;
}

export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Niet geautoriseerd") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function isAdmin(user: AuthzUser): boolean {
  return user.role === UserRole.ADMIN;
}

export function isCoach(user: AuthzUser): boolean {
  return user.role === UserRole.COACH;
}

export function scopedClientWhere(user: AuthzUser): Prisma.ClientWhereInput {
  if (isAdmin(user)) {
    return {};
  }

  return {
    coachId: user.id,
  };
}

export function scopedCoachingSessionWhere(
  user: AuthzUser,
): Prisma.CoachingSessionWhereInput {
  if (isAdmin(user)) {
    return {};
  }

  return {
    ownerUserId: user.id,
  };
}

export function scopedAgentMessageWhere(
  user: AuthzUser,
): Prisma.AgentMessageWhereInput {
  if (isAdmin(user)) {
    return {};
  }

  return {
    session: {
      ownerUserId: user.id,
    },
  };
}

export async function canAccessClient(
  user: AuthzUser,
  clientId: string,
): Promise<boolean> {
  if (!clientId) {
    return false;
  }

  if (isAdmin(user)) {
    const count = await prisma.client.count({
      where: { id: clientId },
    });
    return count > 0;
  }

  const count = await prisma.client.count({
    where: {
      id: clientId,
      coachId: user.id,
    },
  });

  return count > 0;
}

export async function assertCanAccessClient(
  user: AuthzUser,
  clientId: string,
  context?: AuthzContext,
): Promise<void> {
  const allowed = await canAccessClient(user, clientId);
  if (allowed) {
    return;
  }

  logInfo("authz.denied", {
    requestId: context?.requestId ?? null,
    userId: user.id,
    role: user.role,
    clientId: context?.clientId ?? clientId,
    route: context?.route ?? null,
  });

  throw new ForbiddenError("Geen toegang tot deze cliënt.");
}
