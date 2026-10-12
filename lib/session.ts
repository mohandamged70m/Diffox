import crypto from "node:crypto";

const SESSION_COOKIE = "diffox_session";
const OWNER_COOKIE = "diffox_owner";

export const sessionCookieName = SESSION_COOKIE;
export const ownerCookieName = OWNER_COOKIE;

export interface ServerSession {
  id: string;
  ownerId: string;
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
  masked: string;
  remember: boolean;
  createdAt: string;
  lastSeen: string;
}

export function newId(prefix = ""): string {
  return `${prefix}${crypto.randomBytes(12).toString("hex")}`;
}

export function maskKey(key: string): string {
  if (!key) return "••••";
  if (key.length <= 4) return "••••";
  return `••••••••${key.slice(-4)}`;
}

// Sessions are file-backed so the worker + API share them.
import fs from "node:fs";
import path from "node:path";
import { dataDir, ensureDataDir } from "./db";
import { persistentSupported, encryptString, decryptString, b64urlEncode, b64urlDecode } from "./crypto";

function sessionsPath() {
  return path.join(dataDir(), "sessions.json");
}

function readSessions(): Record<string, ServerSession> {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(sessionsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeSessions(s: Record<string, ServerSession>) {
  ensureDataDir();
  const tmp = sessionsPath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
  fs.renameSync(tmp, sessionsPath());
}

export function createSession(s: Omit<ServerSession, "id" | "createdAt" | "lastSeen">): ServerSession {
  const all = readSessions();
  const session: ServerSession = {
    ...s,
    id: newId("ses_"),
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
  all[session.id] = session;
  writeSessions(all);
  return session;
}

export function getSession(id: string | undefined | null): ServerSession | null {
  if (!id) return null;
  const all = readSessions();
  const s = all[id];
  if (!s) return null;
  return s;
}

export function touchSession(id: string) {
  const all = readSessions();
  if (all[id]) {
    all[id].lastSeen = new Date().toISOString();
    writeSessions(all);
  }
}

export function updateSessionKey(id: string, patch: Partial<Pick<ServerSession, "apiKey" | "masked" | "provider" | "baseURL" | "model" | "remember">>) {
  const all = readSessions();
  if (!all[id]) return null;
  all[id] = { ...all[id], ...patch, lastSeen: new Date().toISOString() };
  writeSessions(all);
  return all[id];
}

export function deleteSession(id: string) {
  const all = readSessions();
  delete all[id];
  writeSessions(all);
}

export function isStatelessToken(token: string | undefined | null): boolean {
  return !!token && token.startsWith("enc_");
}

interface StatelessPayload {
  v: 1;
  jti: string;
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
  masked: string;
  remember: boolean;
  createdAt: string;
}

/**
 * Portable session: the credential bundle AES-256-GCM-encrypted with
 * ENCRYPTION_SECRET and carried inside the HttpOnly cookie value. The key is
 * never in the browser in plaintext, and any instance holding the secret can
 * open it — required for multi-instance/serverless hosting, where the
 * file-backed session store does not travel across instances.
 */
export function sealSessionCookie(s: Omit<StatelessPayload, "v" | "jti">): string {
  const payload: StatelessPayload = { ...s, v: 1, jti: newId("") };
  return "enc_" + b64urlEncode(JSON.stringify(encryptString(JSON.stringify(payload))));
}

export function openSessionCookie(token: string | undefined | null): ServerSession | null {
  try {
    if (!isStatelessToken(token)) return null;
    const enc = JSON.parse(b64urlDecode(token!.slice(4))) as { iv: string; tag: string; data: string };
    const payload = JSON.parse(decryptString(enc)) as StatelessPayload;
    if (payload.v !== 1 || !payload.apiKey || !payload.baseURL || !payload.model) return null;
    return {
      id: `stateless-${payload.jti}`,
      ownerId: OWNER_ID,
      provider: payload.provider,
      baseURL: payload.baseURL,
      model: payload.model,
      apiKey: payload.apiKey,
      masked: payload.masked,
      remember: payload.remember,
      createdAt: payload.createdAt,
      lastSeen: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** File-backed session first, portable encrypted cookie second. */
export function resolveSession(token: string | undefined | null): ServerSession | null {
  if (!token) return null;
  if (isStatelessToken(token)) return openSessionCookie(token);
  return getSession(token);
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(value: string, persistent: boolean): string {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  if (persistent) attrs.push(`Max-Age=${60 * 60 * 24 * 30}`);
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${attrs.join("; ")}`;
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export const OWNER_ID = "local-owner";
