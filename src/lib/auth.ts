/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { hashPassword, store } from './storage';

const SESSION_STORAGE_KEY = 'klinik_dompu_auth_session';
const FAILED_ATTEMPTS_KEY = 'klinik_dompu_auth_lockout';

export interface AuthState {
  isAuthenticated: boolean;
  username: string;
  loginTime: number;
  rememberMe: boolean;
}

export interface LockoutState {
  count: number;
  lockedUntil: number; // timestamp in ms
}

export function getLockoutState(): LockoutState {
  try {
    const raw = localStorage.getItem(FAILED_ATTEMPTS_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

export function recordFailedAttempt(): { count: number; lockedUntil: number; isLocked: boolean } {
  const current = getLockoutState();
  const newCount = current.count + 1;
  let lockedUntil = current.lockedUntil;

  // After 5 failed attempts, lock for 60 seconds (1 minute)
  if (newCount >= 5) {
    lockedUntil = Date.now() + 60 * 1000;
  }

  const newState: LockoutState = { count: newCount, lockedUntil };
  localStorage.setItem(FAILED_ATTEMPTS_KEY, JSON.stringify(newState));
  return {
    count: newCount,
    lockedUntil,
    isLocked: lockedUntil > Date.now(),
  };
}

export function resetFailedAttempts() {
  localStorage.removeItem(FAILED_ATTEMPTS_KEY);
}

export async function loginWithCredentials(
  usernameInput: string,
  passwordInput: string,
  rememberMe: boolean
): Promise<{ success: boolean; message?: string }> {
  const lockout = getLockoutState();
  const now = Date.now();
  if (lockout.lockedUntil && lockout.lockedUntil > now) {
    const remainingSec = Math.ceil((lockout.lockedUntil - now) / 1000);
    return {
      success: false,
      message: `Terlalu banyak percobaan gagal. Silakan tunggu ${remainingSec} detik sebelum mencoba kembali.`,
    };
  }

  const cleanUser = usernameInput.trim();
  const cleanPass = passwordInput.trim();
  if (!cleanUser || !cleanPass) {
    return { success: false, message: 'Username dan password wajib diisi.' };
  }
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cleanUser, password: cleanPass, rememberMe }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) {
    const att = res.status === 401 ? recordFailedAttempt() : null;
    return { success: false, message: body.error || (att?.isLocked ? 'Akses ditahan sementara.' : 'Gagal masuk.') };
  }
  resetFailedAttempts();
  const session: AuthState & { token: string } = {
    isAuthenticated: true,
    username: cleanUser,
    loginTime: now,
    rememberMe,
    token: body.token,
  };
  (rememberMe ? localStorage : sessionStorage).setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  store.syncFromDatabase().catch(() => {});
  store.logAudit('Login Berhasil', 'Petugas berhasil masuk ke sistem klinik');
  return { success: true };
}

export function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY) || sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw).token || null : null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  for (const s of [localStorage, sessionStorage]) {
    const raw = s.getItem(SESSION_STORAGE_KEY);
    if (raw) s.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...JSON.parse(raw), token, loginTime: Date.now() }));
  }
}

// Attach the session token to every same-origin API request.
if (typeof window !== 'undefined' && !(window as any).__klinikFetchPatched) {
  (window as any).__klinikFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const token = getAuthToken();
    if (token && url.startsWith('/api/') && !url.startsWith('/api/auth/login')) {
      const headers = new Headers(init.headers);
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }
    return originalFetch(input, init).then((r) => {
      if (r.status === 401 && token && url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.location.reload();
      }
      return r;
    });
  };
}

export function getCurrentSession(): AuthState | null {
  try {
    let raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
    if (!raw) return null;

    const parsed: AuthState & { token?: string } = JSON.parse(raw);
    if (!parsed.token) {
      logoutSession();
      return null;
    }
    const now = Date.now();
    // 30 days expiration if rememberMe, else 24 hours
    const maxAge = parsed.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    if (now - parsed.loginTime > maxAge) {
      logoutSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function logoutSession() {
  if (getAuthToken()) store.logAudit('Logout', 'Petugas keluar dari sistem klinik');
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
