import { NextResponse } from "next/server";
import { storageStatus } from "@/lib/db";
import { persistentSupported } from "@/lib/vault";

/** Unauthenticated diagnostics: storage writability + feature flags. No secrets. */
export async function GET() {
  const storage = storageStatus();
  return NextResponse.json({
    ok: storage.writable,
    storage: { dir: storage.dir, writable: storage.writable, ephemeral: storage.ephemeral },
    persistentKeyStorage: persistentSupported(),
    worker: {
      required: true,
      note: "Reviews stay queued until the separate worker process (npm run worker) claims them. It cannot run on serverless platforms — self-host for full functionality.",
    },
  });
}
