import { afterEach, it, expect, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("boots with all integration placeholders empty", async () => {
  for (const key of ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ENCRYPTION_SECRET", "AI_PROVIDER_BASE_URL", "WORKER_POLL_MS"]) vi.stubEnv(key, "");
  const { configuredFlags, getEnv } = await import("../lib/env");
  expect(configuredFlags()).toMatchObject({ clerk: false, supabase: false, encryption: false });
  expect(getEnv().WORKER_POLL_MS).toBe(5000);
});
