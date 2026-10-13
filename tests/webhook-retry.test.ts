import { createHmac } from "node:crypto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../lib/supabase/server", () => ({ supabaseConfigured: () => true, supabaseService: () => ({ from: mocks.from }) }));
vi.mock("../lib/ai-config", () => ({ getAiConfigStatus: vi.fn() }));
import { POST } from "../app/api/webhooks/github/route";
function request() {
  const body = JSON.stringify({ action: "opened", installation: { id: 1 }, repository: { id: 2, full_name: "owner/repo" }, pull_request: { number: 1, state: "open", draft: false, head: { sha: "abc" }, base: { sha: "base" }, html_url: "https://github.com/owner/repo/pull/1" } });
  return new Request("https://example.com/api/webhooks/github", { method: "POST", body, headers: { "x-hub-signature-256": "sha256=" + createHmac("sha256", "secret").update(body).digest("hex"), "x-github-event": "pull_request", "x-github-delivery": "delivery-1" } });
}
beforeEach(() => { vi.stubEnv("GITHUB_WEBHOOK_SECRET", "secret"); mocks.from.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
it("does not mark failed handling as delivered, so the same delivery can be retried", async () => {
  const log = vi.fn(async () => ({ error: null }));
  let fail = true;
  mocks.from.mockImplementation((table: string) => {
    const query: any = { select: () => query, eq: () => query, not: () => query,
      maybeSingle: async () => ({ data: null, error: null }), insert: log,
      then: (resolve: any) => Promise.resolve({ data: [], error: fail ? { message: "database down" } : null }).then(resolve) };
    if (table === "webhook_deliveries") return query;
    if (table === "installations") return query;
    throw new Error("Unexpected table " + table);
  });
  expect((await POST(request())).status).toBe(500);
  expect(log).not.toHaveBeenCalled();
  fail = false;
  expect((await POST(request())).status).toBe(200);
  expect(log).toHaveBeenCalledOnce();
});
it("acknowledges previously successful deliveries without enqueueing more work", async () => {
  mocks.from.mockImplementation(() => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { delivery_id: "delivery-1" }, error: null }) };
    return query;
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, duplicate: true });
  expect(mocks.from).toHaveBeenCalledTimes(1);
});
