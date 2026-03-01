import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CoachDashboard } from "@/components/coach-dashboard";
import { getServerSessionFromCookieHeader } from "@/lib/auth";
import { getClients } from "@/lib/data/store";
import { syncUserRole } from "@/lib/user-role";
import type { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const headerStore = await headers();
  const session = await getServerSessionFromCookieHeader(
    headerStore.get("cookie") ?? "",
    { source: "app/page.tsx" },
  );

  if (!session) {
    redirect("/login");
  }

  const normalizedRole = await syncUserRole(
    session.user.id,
    session.user.email,
    session.user.role as UserRole | undefined
  );

  const normalizedUser = {
    ...session.user,
    role: normalizedRole,
  } as typeof session.user & { role: UserRole };

  const clients = await getClients({
    userId: normalizedUser.id,
    role: normalizedUser.role,
  });

  return <CoachDashboard clients={clients} currentUser={normalizedUser} />;
}
