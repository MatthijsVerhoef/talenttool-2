import { randomBytes } from "node:crypto";

import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_INVITE_EXPIRATION_HOURS = Number(
  process.env.USER_INVITE_EXPIRES_IN_HOURS ?? "168"
);

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  image?: string | null;
}

export interface PendingInviteSummary {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  createdAt: string;
  expiresAt: string;
  createdByName?: string | null;
  inviteUrl: string;
}

export interface UserInviteDetails {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: string;
  createdAt: string;
}

function getInviteExpirationDate(hours?: number) {
  const duration =
    (hours && Number.isFinite(hours) ? hours : DEFAULT_INVITE_EXPIRATION_HOURS) *
    60 *
    60 *
    1000;
  return new Date(Date.now() + duration);
}

function buildInviteToken() {
  return randomBytes(32).toString("hex");
}

export function getAppBaseUrl() {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_URL;

  if (!envUrl) {
    return "http://localhost:3000";
  }

  if (envUrl.startsWith("http") || envUrl.startsWith("https")) {
    return envUrl.replace(/\/$/, "");
  }

  return `https://${envUrl.replace(/\/$/, "")}`;
}

export function buildInviteUrl(token: string) {
  return `${getAppBaseUrl()}/invite/${token}`;
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      image: true,
    },
  });

  return users.map(mapAdminUserSummary);
}

export async function countAdmins(): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN" },
  });
}

export async function listPendingInvites(): Promise<PendingInviteSummary[]> {
  const invites = await prisma.userInvite.findMany({
    where: {
      acceptedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      createdBy: {
        select: {
          name: true,
        },
      },
    },
  });

  return invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    createdByName: invite.createdBy?.name ?? null,
    inviteUrl: buildInviteUrl(invite.token),
  }));
}

export async function createUserInvite(options: {
  email: string;
  role?: UserRole;
  createdById?: string;
  expirationHours?: number;
}): Promise<UserInviteDetails> {
  const normalizedEmail = options.email.trim().toLowerCase();
  const targetRole = options.role ?? "COACH";
  const token = buildInviteToken();
  const expiresAt = getInviteExpirationDate(options.expirationHours);

  await prisma.userInvite.deleteMany({
    where: {
      email: normalizedEmail,
      acceptedAt: null,
    },
  });

  const invite = await prisma.userInvite.create({
    data: {
      email: normalizedEmail,
      role: targetRole,
      token,
      expiresAt,
      createdById: options.createdById,
    },
  });

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

export async function findActiveInviteByToken(
  token: string
): Promise<UserInviteDetails | null> {
  const invite = await prisma.userInvite.findFirst({
    where: {
      token,
      acceptedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!invite) {
    return null;
  }

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

export async function markInviteAccepted(inviteId: string, userId: string) {
  await prisma.userInvite.update({
    where: { id: inviteId },
    data: {
      acceptedAt: new Date(),
      acceptedById: userId,
    },
  });
}

export async function listCoaches(): Promise<AdminUserSummary[]> {
  const users = await prisma.user.findMany({
    where: { role: "COACH" },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
  }));
}

export async function isCoachUser(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const coach = await prisma.user.findFirst({
    where: { id: userId, role: "COACH" },
    select: { id: true },
  });

  return Boolean(coach);
}

export function mapAdminUserSummary(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  image?: string | null;
}): AdminUserSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    image: user.image ?? null,
  };
}
