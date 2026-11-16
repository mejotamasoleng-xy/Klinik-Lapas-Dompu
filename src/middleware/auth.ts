/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getSetting, setSetting, setSettingIfAbsent } from '../db/queries.ts';

// Shared clinic account. The password is verified on the server and a signed
// session token is required for every API call that touches clinic data.
export const CLINIC_USERNAME = 'klinik';
const DEFAULT_PASSWORD = 'admin';
const CREDENTIALS_KEY = 'auth_credentials';
const SECRET_KEY = 'auth_secret';
const SHORT_SESSION_MS = 24 * 60 * 60 * 1000;
const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredCredentials {
  salt: string;
  hash: string;
  updated_at: string;
}

let cachedSecret: string | null = null;

async function getSigningSecret(): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (cachedSecret) return cachedSecret;
  // Insert-if-absent then re-read, so every server instance agrees on one secret.
  await setSettingIfAbsent(SECRET_KEY, randomBytes(48).toString('hex'));
  const secret = await getSetting(SECRET_KEY);
  if (typeof secret !== 'string' || !secret) throw new Error('Auth secret unavailable');
  cachedSecret = secret;
  return secret;
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function scryptHex(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex');
}

function safeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
}

function makeCredentials(password: string): StoredCredentials {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptHex(password, salt), updated_at: new Date().toISOString() };
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = (await getSetting(CREDENTIALS_KEY)) as StoredCredentials | null;
  if (stored?.salt && stored?.hash) {
    return safeEqualHex(scryptHex(password, stored.salt), stored.hash);
  }
  // Legacy: before server-side credentials existed, the password hash (SHA-256)
  // lived inside the shared app settings. Honour it once, then migrate.
  const appSettings = (await getSetting('app_settings')) as { password_hash?: string } | null;
  const legacyHash = appSettings?.password_hash || sha256Hex(DEFAULT_PASSWORD);
  const ok = safeEqualHex(sha256Hex(password), legacyHash);
  if (ok) await setSetting(CREDENTIALS_KEY, makeCredentials(password));
  return ok;
}

export async function changePassword(newPassword: string) {
  await setSetting(CREDENTIALS_KEY, makeCredentials(newPassword));
}

export async function issueToken(username: string, rememberMe: boolean) {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ u: username, iat: now, exp: now + (rememberMe ? LONG_SESSION_MS : SHORT_SESSION_MS) })
  ).toString('base64url');
  const sig = createHmac('sha256', await getSigningSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

async function verifyToken(token: string): Promise<{ u: string; iat: number; exp: number } | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', await getSigningSecret()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data?.exp !== 'number' || data.exp < Date.now()) return null;
    // Tokens issued before the latest password change are no longer valid.
    const creds = (await getSetting(CREDENTIALS_KEY)) as StoredCredentials | null;
    if (creds?.updated_at && data.iat < Date.parse(creds.updated_at)) return null;
    return data;
  } catch {
    return null;
  }
}

export interface AuthRequest extends Request {
  user?: { username: string };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' });
  }
  try {
    const data = await verifyToken(token);
    if (!data) return res.status(401).json({ error: 'Sesi telah berakhir. Silakan masuk kembali.' });
    req.user = { username: data.u };
    next();
  } catch {
    res.status(503).json({ error: 'Layanan autentikasi belum tersedia. Silakan coba kembali.' });
  }
};
