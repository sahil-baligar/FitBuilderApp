/**
 * Optional Railway / Postgres connectivity probe for /api/health.
 * Sync tables are defined in db/schema.sql — run once against DATABASE_URL.
 */

export interface DatabaseHealth {
  configured: boolean;
  ok?: boolean;
}

export const checkDatabase = async (databaseUrl?: string): Promise<DatabaseHealth> => {
  if (!databaseUrl) return { configured: false };
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 2500,
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query('select 1');
    await client.end();
    return { configured: true, ok: true };
  } catch {
    return { configured: true, ok: false };
  }
};
