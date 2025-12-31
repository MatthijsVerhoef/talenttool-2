import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";

export default async function LoginPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: {
      cookie: headerStore.get("cookie") ?? "",
    },
  });

  if (session) {
    redirect("/");
  }

  return <AuthForm />;
}
