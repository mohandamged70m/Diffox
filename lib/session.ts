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
