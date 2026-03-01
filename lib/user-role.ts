import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const adminEmailList = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string) {
  return adminEmailList.includes(email.trim().toLowerCase());
}

export function resolveTargetRole(email: string, currentRole?: UserRole | null) {
  if (isAdminEmail(email)) {
    return UserRole.ADMIN;
  }
  return currentRole === UserRole.ADMIN ? UserRole.ADMIN : UserRole.COACH;
}

export async function syncUserRole(
  userId: string,
  email: string,
  currentRole?: UserRole | null
): Promise<UserRole> {
  const targetRole = isAdminEmail(email) ? UserRole.ADMIN : UserRole.COACH;
  if (currentRole === targetRole) {
    return targetRole;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: targetRole },
  });

  return targetRole;
}
