import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Sidebar, MobileNav } from "@/components/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const id = cookies().get("diffox_session")?.value;
  if (!getSession(id)) redirect("/setup");
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">{children}</div>
      </div>
    </div>
  );
}
