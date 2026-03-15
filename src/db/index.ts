import { neon } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type DB = NeonHttpDatabase<typeof schema>;

// Lazy singleton — avoids crashing at build time when DATABASE_URL is absent
let _db: DB | null = null;

function getDb(): DB {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL environment variable is not set');
  _db = drizzle(neon(url), { schema });
  return _db;
}

// Proxy lets callers write `db.select()...` while still being lazily initialized
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export * from './schema';
