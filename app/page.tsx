import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default function RootPage() {
  const id = cookies().get("diffox_session")?.value;
  const s = getSession(id);
  redirect(s ? "/dashboard" : "/setup");
}
