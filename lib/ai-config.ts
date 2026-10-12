import { z } from "zod";
import { supabaseService } from "./supabase/server";
import { decryptApiKey, encryptApiKey, maskKey, type SealedKey } from "./crypto";
import { requireEncryptionSecret } from "./env";

export const AI_KEY_SCHEMA = z.object({
  provider: z.string().min(1).max(60).default("opencode-zen"),
  model: z.string().min(1).max(120),
  apiKey: z.string().min(8).max(500),
});

export interface AiConfig {
  provider: string;
  model: string;
  apiKey: string;
}

export interface AiConfigStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  keyMasked: string | null;
  status: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
}

/** Base URL is server-controlled, never per-user (prevents key exfiltration to rogue endpoints). */
export function providerBaseURL(): string {
  return (process.env.AI_PROVIDER_BASE_URL || "https://opencode.ai/zen/v1").replace(/\/+$/, "");
}

/** Load + decrypt the account's AI config. Returns null when not configured. */
export async function getAiConfig(accountId: string): Promise<AiConfig | null> {
  const db = supabaseService();
  const { data, error } = await db
    .from("ai_configs")
    .select("provider, model, key_enc")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`AI config lookup failed: ${error.message}`);
  if (!data) return null;
  try {
    const apiKey = decryptApiKey(data.key_enc as SealedKey);
    return { provider: data.provider, model: data.model, apiKey };
  } catch {
    return null; // wrong ENCRYPTION_SECRET or tampered envelope → treat as unconfigured
  }
}

export async function getAiConfigStatus(accountId: string): Promise<AiConfigStatus> {
  const db = supabaseService();
  const { data, error } = await db
    .from("ai_configs")
    .select("provider, model, key_masked, status, last_tested_at, last_error")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`AI config lookup failed: ${error.message}`);
  if (!data) {
    return { configured: false, provider: null, model: null, keyMasked: null, status: null, lastTestedAt: null, lastError: null };
  }
  return {
    configured: true,
    provider: data.provider,
    model: data.model,
    keyMasked: data.key_masked,
    status: data.status,
    lastTestedAt: data.last_tested_at,
    lastError: data.last_error,
  };
}

/**
 * Validate credentials against the provider, then persist the encrypted key.
 * The plaintext key is never logged, never returned, and never leaves the server.
 */
export async function saveAiConfig(
  accountId: string,
  input: z.infer<typeof AI_KEY_SCHEMA>
): Promise<{ model: string; modelFound: boolean }> {
  requireEncryptionSecret(); // throws when ENCRYPTION_SECRET is missing/short
  const baseURL = providerBaseURL();
  const { testConnection } = await import("../lib/providers/openai-compatible");
  const probe = await testConnection({ baseURL, apiKey: input.apiKey, model: input.model });
  const sealed = encryptApiKey(input.apiKey);
  const db = supabaseService();
  const { error } = await db.from("ai_configs").upsert(
    {
      account_id: accountId,
      provider: input.provider,
      model: input.model,
      key_enc: sealed,
      key_masked: maskKey(input.apiKey),
      status: "active",
      last_tested_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" }
  );
  if (error) throw new Error(`Saving AI config failed: ${error.message}`);
  return { model: input.model, modelFound: probe.modelFound };
}

export async function deleteAiConfig(accountId: string): Promise<void> {
  const db = supabaseService();
  const { error } = await db.from("ai_configs").delete().eq("account_id", accountId);
  if (error) throw new Error(`Deleting AI config failed: ${error.message}`);
}

export async function markAiConfigStatus(
  accountId: string,
  status: "active" | "invalid" | "error",
  lastError: string | null
): Promise<void> {
  const db = supabaseService();
  await db
    .from("ai_configs")
    .update({ status, last_error: lastError, updated_at: new Date().toISOString() })
    .eq("account_id", accountId);
}
