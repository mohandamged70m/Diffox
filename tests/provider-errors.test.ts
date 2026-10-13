import { afterEach, it, expect, vi } from "vitest";
import { listModels, testConnection, chatCompletion } from "../lib/providers/openai-compatible";
afterEach(() => vi.unstubAllGlobals());
it("does not forward provider error bodies containing credentials or private input", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("private-source-code secret-key-123", { status: 400 })));
  const config = { baseURL: "https://provider.example/v1", apiKey: "secret-key-123", model: "test" };
  for (const call of [() => listModels(config), () => testConnection(config), () => chatCompletion(config, [{ role: "user", content: "private-source-code" }])]) {
    await expect(call()).rejects.toMatchObject({ status: 400 });
    try { await call(); } catch (error) {
      expect((error as Error).message).not.toContain("secret-key-123");
      expect((error as Error).message).not.toContain("private-source-code");
    }
  }
});
