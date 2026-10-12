import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { updateDb } from "@/lib/db";
import { newId } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = requireSession(req);
  if (error) return error;
  const now = new Date().toISOString();
  let found = false;
  updateDb((db) => {
    const review = db.reviews.find((r) => r.id === params.id);
    if (!review) return db;
    if (review.status !== "failed") return db;
    found = true;
    return {
      ...db,
      reviews: db.reviews.map((r) => r.id === params.id
        ? { ...r, status: "queued" as const, error: null, retryable: false, incomplete: false, incompleteReason: null, updatedAt: now }
        : r),
      jobs: [...db.jobs, { id: newId("job_"), reviewId: params.id, status: "pending" as const, attempts: 0, lastError: null, createdAt: now, updatedAt: now }],
    };
  });
  if (!found) return NextResponse.json({ error: "Review not found or not failed." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
