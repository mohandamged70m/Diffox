import crypto from "node:crypto";

/** Timing-safe HMAC-SHA256 check of X-Hub-Signature-256 against the raw body. */
export function verifyWebhookSignature(opts: {
  rawBody: Buffer;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  const { rawBody, signatureHeader, secret } = opts;
  if (!signatureHeader || !secret) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
