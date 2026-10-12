import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature } from "../lib/github/webhook";

const SECRET = "webhook-secret-for-tests-0123456789";

function sign(body: Buffer, secret = SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("webhook signature verification", () => {
  it("accepts a valid signature over the untouched raw body", () => {
    const raw = Buffer.from(JSON.stringify({ action: "opened" }), "utf8");
    expect(verifyWebhookSignature({ rawBody: raw, signatureHeader: sign(raw), secret: SECRET })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const raw = Buffer.from(JSON.stringify({ action: "opened" }), "utf8");
    const tampered = Buffer.from(JSON.stringify({ action: "closed" }), "utf8");
    expect(verifyWebhookSignature({ rawBody: tampered, signatureHeader: sign(raw), secret: SECRET })).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const raw = Buffer.from("{}", "utf8");
    expect(verifyWebhookSignature({ rawBody: raw, signatureHeader: sign(raw, "other-secret"), secret: SECRET })).toBe(false);
  });

  it("rejects missing header or missing secret", () => {
    const raw = Buffer.from("{}", "utf8");
    expect(verifyWebhookSignature({ rawBody: raw, signatureHeader: null, secret: SECRET })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: raw, signatureHeader: sign(raw), secret: "" })).toBe(false);
  });

  it("rejects a truncated signature (length mismatch, no timing leak)", () => {
    const raw = Buffer.from("{}", "utf8");
    expect(verifyWebhookSignature({ rawBody: raw, signatureHeader: "sha256=abc", secret: SECRET })).toBe(false);
  });
});
