import crypto from "node:crypto";
import { requireEncryptionSecret } from "./env";

export const ENCRYPTION_VERSION = 1;
const ALGO = "aes-256-gcm";

function key(): Buffer {
  // ENCRYPTION_SECRET is a passphrase; derive a fixed 32-byte key via SHA-256.
  // Format validated in lib/env.ts (min 32 chars).
  return crypto.createHash("sha256").update(requireEncryptionSecret()).digest();
}

export interface SealedKey {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

/** Encrypt an API key with AES-256-GCM + fresh 96-bit nonce. Returns versioned envelope. */
export function encryptApiKey(plain: string): SealedKey {
  if (!plain) throw new Error("Cannot encrypt an empty key.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    v: ENCRYPTION_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: enc.toString("base64"),
  };
}

/** Decrypt a versioned envelope. Throws on wrong version, tamper, or wrong secret. */
export function decryptApiKey(payload: SealedKey): string {
  if (!payload || payload.v !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption version (expected v${ENCRYPTION_VERSION}).`);
  }
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Legacy helper kept for session-cookie compat: same primitive, unversioned shape. */
export function encryptString(plain: string): { iv: string; tag: string; data: string } {
  const { iv, tag, data } = encryptApiKey(plain);
  return { iv, tag, data };
}

export function decryptString(payload: { iv: string; tag: string; data: string }): string {
  return decryptApiKey({ v: ENCRYPTION_VERSION, ...payload });
}

export function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

export function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export function maskKey(keyText: string): string {
  if (!keyText || keyText.length <= 4) return "••••";
  return `••••${keyText.slice(-4)}`;
}

export function persistentSupported(): boolean {
  return (process.env.ENCRYPTION_SECRET || "").length >= 32;
}
