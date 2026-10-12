import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";

const Body = z.object({
  reviewPreferences: z.string().max(4000).optional().default(""),
  projectInstructions: z.string().max(8000).optional().default(""),
});

export async function GET(req: NextRequest) {
  const { error } = requireSession(req);
  if (error) return error;
  return NextResponse.json({ settings: readDb().settings });
}

export async function PUT(req: NextRequest) {
  const { error } = requireSession(req);
  if (error) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  const db = updateDb((d) => ({ ...d, settings: { reviewPreferences: parsed.data.reviewPreferences, projectInstructions: parsed.data.projectInstructions } }));
  return NextResponse.json({ settings: db.settings });
}
