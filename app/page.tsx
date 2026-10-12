import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession } from "@/lib/session";

export default function RootPage() {
  const id = cookies().get("diffox_session")?.value;
  const s = resolveSession(id);
  redirect(s ? "/dashboard" : "/setup");
}
