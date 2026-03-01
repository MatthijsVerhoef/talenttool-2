import { UserRole } from "@prisma/client";

import { getServerSessionFromRequest } from "@/lib/auth";
import { getRequestId } from "@/lib/observability";

export class SessionGuardError extends Error {
  status: 401 | 403;
  requestId: string;

  constructor(status: 401 | 403, message: string, requestId: string) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }
}

export async function requireAuthenticatedSession(
  request: Request,
  requestId?: string,
): Promise<{
  requestId: string;
  userId: string;
  role: UserRole;
}> {
  const resolvedRequestId = requestId ?? getRequestId(request);
  const session = await getServerSessionFromRequest(request, {
    requestId: resolvedRequestId,
    source: "lib/auth-guards.requireAuthenticatedSession",
  });

  if (!session) {
    throw new SessionGuardError(401, "Niet geautoriseerd", resolvedRequestId);
  }

  return {
    requestId: resolvedRequestId,
    userId: session.user.id,
    role: session.user.role as UserRole,
  };
}

export async function requireAdminSession(
  request: Request,
  requestId?: string,
): Promise<{
  requestId: string;
  userId: string;
}> {
  const session = await requireAuthenticatedSession(request, requestId);

  if (session.role !== UserRole.ADMIN) {
    throw new SessionGuardError(403, "Niet geautoriseerd", session.requestId);
  }

  return {
    requestId: session.requestId,
    userId: session.userId,
  };
}
