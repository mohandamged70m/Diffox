import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, "Missing Clerk publishable key").optional(),
  CLERK_SECRET_KEY: z.string().min(1, "Missing Clerk secret key").optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("Invalid Supabase URL").optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "Missing Supabase service-role key").optional(),
  ENCRYPTION_SECRET: z.string().min(32, "ENCRYPTION_SECRET must be >= 32 chars").optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  AI_PROVIDER_BASE_URL: z.string().url().default("https://opencode.ai/zen/v1"),
  DIFFOX_LOCAL_TEST: z.string().optional(),
  WORKER_POLL_MS: z.coerce.number().default(5000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Validated server env. Optional integrations stay optional so the app boots without credentials. */
export function getEnv(): Env {
  if (cached) return cached;
  cached = envSchema.parse(process.env);
  return cached;
}

export function requireEncryptionSecret(): string {
  const s = process.env.ENCRYPTION_SECRET || "";
  if (s.length < 32) {
    throw new Error("ENCRYPTION_SECRET must be set and at least 32 characters.");
  }
  return s;
}

export function isLocalTestMode(): boolean {
  return process.env.DIFFOX_LOCAL_TEST === "1";
}

export function configuredFlags() {
  const e = getEnv();
  return {
    clerk: Boolean(e.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && e.CLERK_SECRET_KEY),
    supabase: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY),
    githubApp: Boolean(e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_WEBHOOK_SECRET),
    encryption: Boolean((process.env.ENCRYPTION_SECRET || "").length >= 32),
    localTest: isLocalTestMode(),
  };
}
