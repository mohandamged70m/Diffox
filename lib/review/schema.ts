import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  title: z.string().min(3).max(160),
  file: z.string().max(500).nullable().optional(),
  line: z.number().int().positive().nullable().optional(),
  explanation: z.string().min(10).max(4000),
  suggestion: z.string().min(5).max(4000),
  excerpt: z.string().max(4000).nullable().optional(),
});

export const ReviewOutputSchema = z.object({
  summary: z.string().min(10).max(6000),
  findings: z.array(FindingSchema).max(30),
  incomplete: z.boolean().optional().default(false),
});

export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

/** Extract the first JSON object from model text (handles code fences). */
export function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found in model response.");
  return candidate.slice(start, end + 1);
}

export function parseReviewOutput(raw: string): ReviewOutput {
  return ReviewOutputSchema.parse(JSON.parse(extractJson(raw)));
}
