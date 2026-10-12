import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { storageStatus } from "@/lib/db";
import { Sidebar, MobileNav } from "@/components/sidebar";
import { Alert } from "@/components/ui/primitives";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const id = cookies().get("diffox_session")?.value;
  if (!getSession(id)) redirect("/setup");
  const storage = storageStatus();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">
          {!storage.writable && (
            <Alert kind="error" className="mb-6">
              Storage is not writable ({storage.dir}). Sessions and reviews cannot be saved.
              Set DATA_DIR to a writable directory — serverless filesystems are read-only (see README “Deployment”).
            </Alert>
          )}
          {storage.writable && storage.ephemeral && (
            <Alert kind="warn" className="mb-6">
              Running on ephemeral storage ({storage.dir}): sessions and review history vanish on
              redeploy/instance churn, and queued reviews need a separately hosted worker.
              Self-host with Docker for durable storage.
            </Alert>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
