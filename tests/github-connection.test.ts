import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), user: vi.fn(), installationRepos: vi.fn(), from: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUserOauthAccessToken: mocks.token } }) }));
vi.mock("octokit", () => ({ Octokit: class { request = mocks.user; } }));
vi.mock("../lib/auth", () => ({ requireAccount: async () => ({ id: "acct-1", clerk_user_id: "user-1" }) }));
vi.mock("../lib/supabase/server", () => ({ supabaseConfigured: () => true, supabaseService: () => ({ from: mocks.from }) }));
vi.mock("../lib/github/app", () => ({ githubAppConfigured: () => true, appInstallUrl: () => "", appOctokit: () => ({ request: async () => ({ data: { account: { id: 42, login: "owner", type: "User" } } }) }), installationOctokit: mocks.installationRepos }));
import { POST } from "../app/api/github/connection/route";
function request() { return new Request("https://example.com/api/github/connection", { method: "POST", body: JSON.stringify({ installation_id: 123 }), headers: { "content-type": "application/json" } }); }
beforeEach(() => { vi.clearAllMocks(); mocks.token.mockResolvedValue({ data: [{ token: "server-oauth-token" }] }); });
it("rejects another GitHub owner before accessing installation repositories", async () => {
  mocks.user.mockResolvedValue({ data: { id: 7 } });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.installationRepos).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.token).toHaveBeenCalledWith("user-1", "github");
});
it("fails closed when no linked GitHub credential exists", async () => {
  mocks.token.mockResolvedValue({ data: [] });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.installationRepos).not.toHaveBeenCalled();
});
it("binds a verified owner and never returns the OAuth token", async () => {
  mocks.user.mockResolvedValue({ data: { id: 42 } });
  mocks.installationRepos.mockResolvedValue({ request: async () => ({ data: { repositories: [] } }) });
  const upsert = vi.fn(async (_value: unknown, _options?: unknown) => ({ error: null }));
  mocks.from.mockReturnValue({ upsert });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(upsert.mock.calls[0][0]).toMatchObject({ account_id: "acct-1", installation_id: 123, verified_at: expect.any(String) });
  expect(JSON.stringify(await response.json())).not.toContain("server-oauth-token");
});
