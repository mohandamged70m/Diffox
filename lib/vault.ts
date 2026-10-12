import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, ensureDataDir } from "./db";
import { OWNER_ID } from "./session";

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

function vaultPath() {
  return path.join(dataDir(), "vault.json");
}

interface Vault { ownerId: string; provider: string; baseURL: string; model: string; payload: { iv: string; tag: string; data: string }; updatedAt: string; }

export function saveVault(entry: Omit<Vault, "ownerId" | "updatedAt">) {
  if (!persistentSupported()) throw new Error("Persistent storage is not configured (ENCRYPTION_SECRET missing).");
  ensureDataDir();
  const rec: Vault = { ...entry, ownerId: OWNER_ID, updatedAt: new Date().toISOString() };
  fs.writeFileSync(vaultPath(), JSON.stringify(rec, null, 2), "utf8");
}

export function readVault(): (Vault & { apiKey: string }) | null {
  try {
    const raw = fs.readFileSync(vaultPath(), "utf8");
    const rec = JSON.parse(raw) as Vault;
    if (!rec.payload) return null;
    return { ...rec, apiKey: decryptString(rec.payload) };
  } catch {
    return null;
  }
}

export function deleteVault() {
  try {
    fs.unlinkSync(vaultPath());
  } catch { /* noop */ }
}
