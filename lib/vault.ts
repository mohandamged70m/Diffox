import path from "node:path";
import fs from "node:fs";
import { dataDir, ensureDataDir } from "./db";
import { OWNER_ID } from "./session";
import { persistentSupported, encryptString, decryptString } from "./crypto";

export { persistentSupported };

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
