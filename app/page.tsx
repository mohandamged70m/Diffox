import { redirect } from "next/navigation";
import { configuredFlags } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  // No credentials → show setup guidance instead of crashing on Clerk.
  if (!configuredFlags().clerk) redirect("/sign-in");
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  redirect(userId ? "/overview" : "/sign-in");
}
