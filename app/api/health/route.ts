import { NextResponse } from "next/server";
import { configuredFlags } from "@/lib/env";

/** Unauthenticated health check (never exposes secrets). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "reviewkit",
    flags: configuredFlags(),
    time: new Date().toISOString(),
  });
}
