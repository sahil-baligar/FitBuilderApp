import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';
import { log } from '../util/log.js';

/**
 * Shared Postgres pool.
 *
 * Railway terminates TLS with a certificate the default trust store does not
 * recognise, so verification is relaxed for remote hosts but left intact for
 * local development. Connections are pooled because the API is request-driven
 * and per-request connects would dominate latency.
 */

let pool: pg.Pool | undefined;
/** Set by tests to run against an in-memory Postgres instead of a real one. */
let injected: pg.Pool | undefined;

const isLocal = (url: string) => /@(localhost|127\.0\.0\.1|::1)[:/]/.test(url);

export const databaseConfigured = (): boolean => Boolean(injected) || Boolean(env.databaseUrl);

/** Test seam. Passing undefined restores the real pool. */
export const setPool = (next: pg.Pool | undefined): void => {
  injected = next;
};

export const getPool = (): pg.Pool => {
  if (injected) return injected;
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not set; cloud accounts and sync are unavailable.');
  }
  pool ??= new pg.Pool({
    connectionString: env.databaseUrl,
    ssl: isLocal(env.databaseUrl) ? undefined : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => log.error('postgres pool error', err));
  return pool;
};

export const query = async <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<T>> => getPool().query<T>(text, values);

/** Runs `fn` inside a transaction, rolling back on any throw. */
export const transaction = async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
};

export const closePool = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
};

/**
 * Applies db/schema.sql at boot. Every statement in that file is idempotent,
 * so this is safe to run on every deploy and keeps a fresh Railway database
 * usable without a manual step.
 */
export const migrate = async (): Promise<void> => {
  // Tests inject a pool whose schema they have already applied themselves.
  if (injected) return;
  if (!databaseConfigured()) {
    log.warn('DATABASE_URL is not set: running without accounts or cloud sync.');
    return;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/db/ in dev, dist/ once bundled; look in both.
  const candidates = [
    path.resolve(here, '../../../../db/schema.sql'),
    path.resolve(here, '../../../db/schema.sql'),
    path.resolve(process.cwd(), 'db/schema.sql'),
    path.resolve(process.cwd(), '../../db/schema.sql'),
  ];
  let sql: string | undefined;
  for (const candidate of candidates) {
    try {
      sql = await fs.readFile(candidate, 'utf8');
      break;
    } catch {
      /* try next */
    }
  }
  if (!sql) throw new Error(`Could not locate db/schema.sql (looked in: ${candidates.join(', ')})`);

  const started = Date.now();
  await transaction(async (client) => {
    await client.query(sql!);
  });
  log.info(`database schema applied in ${Date.now() - started}ms`);
};
