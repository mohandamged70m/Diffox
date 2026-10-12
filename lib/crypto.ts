import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

export function persistentSupported(): boolean {
  return Boolean(process.env.ENCRYPTION_SECRET && process.env.ENCRYPTION_SECRET.length >= 32);
}

function key(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || "";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptString(plain: string): { iv: string; tag: string; data: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: enc.toString("base64") };
}

export function decryptString(payload: { iv: string; tag: string; data: string }): string {
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
}

export function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

export function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}
