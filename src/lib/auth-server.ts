import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { pool } from '../db/index.ts';

function toOrigin(value?: string) {
  if (!value) return undefined;
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).origin;
  } catch {
    return undefined;
  }
}

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
}

const deploymentUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;

const trustedOrigins = new Set<string>();
if (process.env.NODE_ENV === 'development') {
  trustedOrigins.add('http://localhost:3000');
  [
    process.env.V0_RUNTIME_URL,
    process.env.V0_DEV_APP_URL,
    process.env.V0_BUILD_URL,
    process.env.V0_SANDBOX_URL,
  ].forEach((url) => {
    const origin = toOrigin(url);
    if (origin) trustedOrigins.add(origin);
  });
}
if (process.env.NODE_ENV === 'production') {
  [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].forEach((url) => {
    const origin = toOrigin(url);
    if (origin) trustedOrigins.add(origin);
  });
}

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL ?? deploymentUrl ?? process.env.V0_RUNTIME_URL,
  trustedOrigins: [...trustedOrigins],
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 5,
    maxPasswordLength: 72,
  },
  user: {
    additionalFields: {
      mustChangePassword: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  plugins: [username({ displayUsername: false, immutableUsername: true })],
  disabledPaths: ['/is-username-available'],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 12,
  },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
});
