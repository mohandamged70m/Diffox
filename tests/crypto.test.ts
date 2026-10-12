import { describe, it, expect, beforeEach } from "vitest";
import { encryptApiKey, decryptApiKey, maskKey } from "../lib/crypto";

const SECRET = "test-encryption-secret-32-chars!!";

beforeEach(() => {
  process.env.ENCRYPTION_SECRET = SECRET;
});

describe("AES-256-GCM key encryption", () => {
  it("round-trips an API key", () => {
    const sealed = encryptApiKey("sk-test-1234567890");
    expect(sealed.v).toBe(1);
    expect(decryptApiKey(sealed)).toBe("sk-test-1234567890");
  });

  it("uses a fresh nonce per encryption", () => {
    const a = encryptApiKey("same-key");
    const b = encryptApiKey("same-key");
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("fails on tampered ciphertext or tag", () => {
    const sealed = encryptApiKey("sk-test-1234567890");
    expect(() => decryptApiKey({ ...sealed, data: Buffer.from("tampered").toString("base64") })).toThrow();
    expect(() => decryptApiKey({ ...sealed, tag: Buffer.from("00".repeat(16), "hex").toString("base64") })).toThrow();
  });

  it("rejects an unknown encryption version", () => {
    const sealed = encryptApiKey("sk-test");
    expect(() => decryptApiKey({ ...sealed, v: 99 })).toThrow(/version/i);
  });

  it("fails with the wrong ENCRYPTION_SECRET", () => {
    const sealed = encryptApiKey("sk-test-1234567890");
    process.env.ENCRYPTION_SECRET = "a-different-secret-32-chars-here";
    expect(() => decryptApiKey(sealed)).toThrow();
  });

  it("refuses short or missing ENCRYPTION_SECRET", () => {
    process.env.ENCRYPTION_SECRET = "too-short";
    expect(() => encryptApiKey("sk-test")).toThrow(/32/);
    delete process.env.ENCRYPTION_SECRET;
    expect(() => encryptApiKey("sk-test")).toThrow();
  });

  it("masks keys for display", () => {
    expect(maskKey("sk-test-1234")).toBe("••••1234");
  });
});
