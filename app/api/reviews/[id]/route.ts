import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { readDb, updateDb } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = requireSession(req);
  if (error) return error;
  const db = readDb();
  const review = db.reviews.find((r) => r.id === params.id);
  if (!review) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ review });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = requireSession(req);
  if (error) return error;
  updateDb((db) => ({ ...db, reviews: db.reviews.filter((r) => r.id !== params.id), jobs: db.jobs.filter((j) => j.reviewId !== params.id) }));
  return NextResponse.json({ ok: true });
}
