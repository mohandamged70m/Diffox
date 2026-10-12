import { NextResponse } from "next/server";
import { storageStatus } from "@/lib/db";
import { configuredFlags } from "@/lib/env";

/** Unauthenticated health check (never exposes secrets). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "reviewkit",
    flags: configuredFlags(),
    storage: storageStatus(),
    time: new Date().toISOString(),
  });
}
