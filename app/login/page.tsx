import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSessionFromCookieHeader } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginPage() {
  const headerStore = await headers();
  const session = await getServerSessionFromCookieHeader(
    headerStore.get("cookie") ?? "",
    { source: "app/login/page.tsx" },
  );

  if (session) {
    redirect("/");
  }

  return <AuthForm />;
}
