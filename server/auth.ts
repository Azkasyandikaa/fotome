/**
 * Developer-only auth untuk galeri.
 * - Login via password (env GALLERY_ADMIN_PASSWORD).
 * - Sesi = token acak di memori + cookie HttpOnly (hilang saat server restart).
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

interface AdminSession {
  token: string;
  expiresAt: number;
  createdAt: number;
}

const sessions = new Map<string, AdminSession>();

export const ADMIN_COOKIE = 'fm_admin';

/**
 * Password developer bawaan — bisa ditimpa lewat env GALLERY_ADMIN_PASSWORD
 * (dibaca setiap login, gampang diganti tanpa restart).
 */
const DEFAULT_ADMIN_PASSWORD = 'Azkasyan77';

function adminPassword(): string | null {
  const pw = process.env.GALLERY_ADMIN_PASSWORD;
  return pw && pw.trim() ? pw.trim() : DEFAULT_ADMIN_PASSWORD;
}

export function isAuthConfigured(): boolean {
  return adminPassword() !== null;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(token);
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function createSession(res: Response): void {
  pruneExpired();
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { token, expiresAt: Date.now() + SESSION_TTL_MS, createdAt: Date.now() });
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  );
}

export function destroySession(req: Request, res: Response): void {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function isValidAdmin(req: Request): boolean {
  pruneExpired();
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE];
  if (!token) return false;
  return sessions.has(token);
}

const attempts = new Map<string, { count: number; reset: number }>();

/** Check password + rate limit sederhana per IP (maks 10 percobaan/menit). */
export function checkPassword(password: unknown, ip: string): boolean {
  const expected = adminPassword();
  if (!expected || typeof password !== 'string') return false;
  const now = Date.now();
  let rec = attempts.get(ip);
  if (!rec || now > rec.reset) {
    rec = { count: 0, reset: now + 60_000 };
    attempts.set(ip, rec);
  }
  rec.count++;
  if (rec.count > 10) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Express middleware: 401 kecuali admin valid (atau dev bypass). */
export function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (devBypass()) {
    next();
    return;
  }
  if (isValidAdmin(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'unauthorized' });
}

/** Bypass di mode dev (tanpa password) — set GALLERY_DEV_BYPASS=1 untuk aktif. */
export function devBypass(): boolean {
  return process.env.GALLERY_DEV_BYPASS === '1';
}
