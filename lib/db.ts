import fs from "node:fs";
import path from "node:path";

export function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  // Serverless platforms (Vercel, AWS Lambda) mount the app read-only (/var/task).
  // Only /tmp is writable there — ephemeral and per-instance. Prefer self-hosting
  // (Docker/VPS) for durable storage; see README "Deployment".
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "diffox-data");
  }
  return path.join(process.cwd(), "data");
}

export function storageStatus(): { dir: string; writable: boolean; ephemeral: boolean } {
  const dir = dataDir();
  const ephemeral = dir.startsWith("/tmp");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return { dir, writable: true, ephemeral };
  } catch {
    return { dir, writable: false, ephemeral };
  }
}

export function ensureDataDir() {
  const st = storageStatus();
  if (!st.writable) {
    throw new Error(
      `DiffFox storage unavailable: cannot write to ${st.dir}. ` +
        `Set DATA_DIR to a writable directory. ` +
        `Serverless filesystems (e.g. Vercel /var/task) are read-only — only /tmp is writable there, ` +
        `and it is ephemeral. For durable sessions, review history, and the worker queue, self-host with Docker or a VPS (see README "Deployment").`
    );
  }
}

export type ReviewStatus = "queued" | "working" | "completed" | "failed";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "open" | "resolved" | "dismissed";

export interface Finding {
  id: string;
  severity: Exclude<Severity, "info"> | "info";
  title: string;
  file: string | null;
  line: number | null;
  verified: boolean;
  explanation: string;
  suggestion: string;
  excerpt: string | null;
  status: FindingStatus;
}

export interface Review {
  id: string;
  inputType: "diff" | "snippet";
  language: string | null;
  repository: string | null;
  title: string;
  content: string;
  context: string | null;
  instructions: string | null;
  status: ReviewStatus;
  summary: string | null;
  findings: Finding[];
  incomplete: boolean;
  incompleteReason: string | null;
  error: string | null;
  retryable: boolean;
  attempts: number;
  model: string | null;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Job {
  id: string;
  reviewId: string;
  status: "pending" | "claimed" | "done" | "error";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbShape {
  reviews: Review[];
  jobs: Job[];
  repositories: { name: string; connectedAt: string; status: string }[];
  settings: { reviewPreferences: string; projectInstructions: string };
}

const DEFAULTS: DbShape = {
  reviews: [],
  jobs: [],
  repositories: [],
  settings: { reviewPreferences: "Focus on correctness, security, performance.", projectInstructions: "" },
};

function dbPath(): string {
  return path.join(dataDir(), "db.json");
}

export function readDb(): DbShape {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(dbPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    writeDb(DEFAULTS);
    return DEFAULTS;
  }
}

/** Atomic write: temp file + rename. */
export function writeDb(db: DbShape) {
  ensureDataDir();
  const tmp = dbPath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, dbPath());
}

export function updateDb(mut: (db: DbShape) => DbShape): DbShape {
  const db = readDb();
  const next = mut(db);
  writeDb(next);
  return next;
}
