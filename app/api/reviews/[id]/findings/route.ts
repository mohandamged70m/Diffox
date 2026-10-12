import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { updateDb } from "@/lib/db";

const Body = z.object({
  findingId: z.string().min(1),
  status: z.enum(["open", "resolved", "dismissed"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = requireSession(req);
  if (error) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "findingId + status required." }, { status: 400 });
  let found = false;
  updateDb((db) => ({
    ...db,
    reviews: db.reviews.map((r) => {
      if (r.id !== params.id) return r;
      return {
        ...r,
        findings: r.findings.map((f) => {
          if (f.id !== parsed.data.findingId) return f;
          found = true;
          return { ...f, status: parsed.data.status };
        }),
        updatedAt: new Date().toISOString(),
      };
    }),
  }));
  if (!found) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
