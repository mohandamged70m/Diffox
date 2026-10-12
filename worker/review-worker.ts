/**
 * DiffFox review worker — separate Node.js process with a durable file-backed queue.
 *
 * Run:  npm run worker
 * Polls data/db.json for pending jobs, calls the provider server-side with
 * bounded retries + backoff, validates structured output with zod, verifies
 * file/line refs against the submitted diff, and writes results back.
 * Failed jobs are preserved with their error and can be retried from the UI.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chatCompletion, withBackoff } from "../lib/providers/openai-compatible";
import { classifyError, normalizeModelId } from "../lib/providers/types";
import { buildReviewMessages } from "../lib/review/prompt";
import { parseReviewOutput } from "../lib/review/schema";
import { parseDiff, verifyRef } from "../lib/diff/parse";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

interface Session { id: string; provider: string; baseURL: string; model: string; apiKey: string; }

function loadSessionForReview(): Session | null {
  // Single-owner personal app: use the most recently seen session as the credential source.
  const sessions = readJson<Record<string, Session & { lastSeen: string }>>(path.join(DATA_DIR, "sessions.json"), {});
  const list = Object.values(sessions).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return list[0] ?? null;
}

async function processOne(): Promise<boolean> {
  const dbFile = path.join(DATA_DIR, "db.json");
  const db = readJson<{ reviews: any[]; jobs: any[]; settings: any }>(dbFile, { reviews: [], jobs: [], settings: {} });
  const job = db.jobs.find((j) => j.status === "pending");
  if (!job) return false;
  const review = db.reviews.find((r) => r.id === job.reviewId);
  if (!review) {
    job.status = "error";
    job.lastError = "Review record missing.";
    job.updatedAt = new Date().toISOString();
    writeAtomic(dbFile, db);
    return true;
  }

  // Claim
  job.status = "claimed";
  job.attempts += 1;
  job.updatedAt = new Date().toISOString();
  review.status = "working";
  review.attempts += 1;
  review.updatedAt = new Date().toISOString();
  writeAtomic(dbFile, db);

  const session = loadSessionForReview();
  if (!session) {
    return fail(dbFile, job.id, review.id, "No configured AI session. Complete setup first.");
  }

  try {
    const prefs = (db.settings?.reviewPreferences || "").trim();
    const messages = buildReviewMessages({
      inputType: review.inputType,
      content: review.content,
      language: review.language,
      context: review.context,
      instructions: [prefs, review.instructions].filter(Boolean).join("\n\n") || null,
    });
    const raw = await withBackoff(
      () => chatCompletion({ baseURL: session.baseURL, apiKey: session.apiKey, model: normalizeModelId(session.provider, review.model || session.model) }, messages, { maxTokens: 4000 }),
      3
    );
    let parsed;
    try {
      parsed = parseReviewOutput(raw);
    } catch {
      return fail(dbFile, job.id, review.id, "Model returned malformed (non-schema) output. Retry may help.", true);
    }

    // Verify refs against the submitted diff. Never fabricate.
    const files = review.inputType === "diff" ? parseDiff(review.content) : [];
    const findings = parsed.findings.slice(0, 20).map((f) => {
      const v = review.inputType === "diff"
        ? verifyRef(files, f.file ?? null, f.line ?? null)
        : { verified: false, file: f.file ?? null, line: null as number | null };
      return {
        id: "fnd_" + crypto.randomBytes(8).toString("hex"),
        severity: f.severity,
        title: f.title,
        file: v.file,
        line: v.line,
        verified: v.verified,
        explanation: f.explanation,
        suggestion: f.suggestion,
        excerpt: f.excerpt ?? null,
        status: "open" as const,
      };
    });

    const db2 = readJson<{ reviews: any[]; jobs: any[] }>(dbFile, { reviews: [], jobs: [] });
    const r2 = db2.reviews.find((r) => r.id === review.id);
    const j2 = db2.jobs.find((j) => j.id === job.id);
    if (r2 && j2) {
      r2.status = "completed";
      r2.summary = parsed.summary;
      r2.findings = findings;
      r2.incomplete = Boolean(parsed.incomplete);
      r2.incompleteReason = parsed.incomplete ? "Model flagged the review as incomplete." : null;
      r2.error = null;
      r2.retryable = false;
      r2.completedAt = new Date().toISOString();
      r2.updatedAt = r2.completedAt;
      j2.status = "done";
      j2.updatedAt = new Date().toISOString();
      writeAtomic(dbFile, db2);
    }
  } catch (e) {
    const c = classifyError(e);
    const retryable = c.kind === "ratelimit" || c.kind === "server" || c.kind === "network";
    return fail(dbFile, job.id, review.id, c.message, retryable);
  }
  return true;
}

function fail(dbFile: string, jobId: string, reviewId: string, message: string, retryable = true): boolean {
  const db = readJson<{ reviews: any[]; jobs: any[] }>(dbFile, { reviews: [], jobs: [] });
  const j = db.jobs.find((x) => x.id === jobId);
  const r = db.reviews.find((x) => x.id === reviewId);
  const now = new Date().toISOString();
  if (j) { j.status = "error"; j.lastError = message; j.updatedAt = now; }
  if (r) {
    r.status = "failed";
    r.error = message;
    r.retryable = retryable;
    r.incomplete = true;
    r.incompleteReason = message;
    r.updatedAt = now;
  }
  writeAtomic(dbFile, db);
  return true;
}

async function main() {
  console.log(`[diffox-worker] watching ${path.join(DATA_DIR, "db.json")} every ${POLL_MS}ms`);
  for (;;) {
    try {
      const did = await processOne();
      await new Promise((r) => setTimeout(r, did ? 500 : POLL_MS));
    } catch (e) {
      console.error("[diffox-worker] loop error", (e as Error)?.message);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

main();
