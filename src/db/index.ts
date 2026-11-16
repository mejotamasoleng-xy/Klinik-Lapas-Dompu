import * as dotenv from 'dotenv';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

dotenv.config({ path: '.env.development.local' });
dotenv.config();

declare global {
  var _postgresPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be configured for the online database.');
}

export const hasSqlConfig = true;

export const createPool = () => {
  if (!globalThis._postgresPool) {
    globalThis._postgresPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    globalThis._postgresPool.on('error', (error) => {
      console.error('Unexpected error on the Neon PostgreSQL pool:', error);
    });
  }
  return globalThis._postgresPool;
};

export const pool = createPool();
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
