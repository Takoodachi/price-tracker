import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger';
import { pool } from './pool';

/** Walks up from this file to apps/api (works from src/ in dev and dist/ in prod). */
function migrationsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'migrations'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Could not find the migrations directory');
    dir = parent;
  }
  return join(dir, 'migrations');
}

/**
 * Applies every migrations/*.sql file that hasn't run yet, in filename order,
 * each in its own transaction. An advisory lock makes it safe for the API and
 * worker to start at the same time.
 */
export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const dir = migrationsDir();
    const pending = readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && !applied.has(f))
      .sort();

    for (const file of pending) {
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ file }, 'applied migration');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
}
