import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";
import { newId } from "@/lib/session";

const Body = z.object({
  inputType: z.enum(["diff", "snippet"]),
  content: z.string().min(10).max(120000),
  language: z.string().max(60).optional().default(""),
  context: z.string().max(20000).optional().default(""),
  instructions: z.string().max(8000).optional().default(""),
  repository: z.string().max(200).optional().default(""),
});

function titleFor(inputType: string, content: string, repository: string): string {
  if (repository) return `${repository} · ${inputType} review`;
  const first = content.split("\n").find((l) => l.trim().length > 0) || inputType;
  return `${inputType === "diff" ? "Diff" : "Snippet"} review — ${first.slice(0, 60)}`;
}

export async function GET(req: NextRequest) {
  const { error } = requireSession(req);
  if (error) return error;
  const db = readDb();
  return NextResponse.json({ reviews: [...db.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}

export async function POST(req: NextRequest) {
  const { error, session } = requireSession(req);
  if (error || !session) return error;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Content must be 10–120,000 characters with inputType diff|snippet." }, { status: 400 });
  }
  const b = parsed.data;
  // Merge stored project instructions with per-review instructions.
  const db0 = readDb();
  const stored = db0.settings.projectInstructions || "";
  const instructions = [stored, b.instructions].filter(Boolean).join("\n\n").slice(0, 8000) || null;

  const now = new Date().toISOString();
  const reviewId = newId("rev_");
  const jobId = newId("job_");
  updateDb((db) => ({
    ...db,
    reviews: [...db.reviews, {
      id: reviewId,
      inputType: b.inputType,
      language: b.language || null,
      repository: b.repository || null,
      title: titleFor(b.inputType, b.content, b.repository),
      content: b.content,
      context: b.context || null,
      instructions,
      status: "queued",
      summary: null,
      findings: [],
      incomplete: false,
      incompleteReason: null,
      error: null,
      retryable: false,
      attempts: 0,
      model: session.model,
      provider: session.provider,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }],
    jobs: [...db.jobs, { id: jobId, reviewId, status: "pending", attempts: 0, lastError: null, createdAt: now, updatedAt: now }],
  }));
  const db = readDb();
  return NextResponse.json({ review: db.reviews.find((r) => r.id === reviewId), jobId }, { status: 201 });
}
