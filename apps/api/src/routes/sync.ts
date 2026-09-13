import express, { type Router } from 'express';
import type { ClothingItem, Fit } from '@fitbuilder/core/contracts';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { databaseConfigured, query, transaction } from '../db/pool.js';
import { HttpError } from './validate.js';

/**
 * Cloud sync for wardrobe items and saved fits.
 *
 * Records are stored whole as JSONB, so the client's shape can change without a
 * migration. Every statement filters on user_id: with no row-level security in
 * play, this API is the only boundary between accounts.
 *
 * Conflict resolution is last-write-wins on `updatedAt`, which suits a
 * single-user-per-account app and avoids a merge UI nobody wants.
 */

interface SyncRow {
  id: string;
  payload: ClothingItem | Fit;
  updated_at: string;
  is_deleted: boolean;
}

const TABLES = { wardrobe: 'wardrobe_items', fits: 'fits' } as const;
type Collection = keyof typeof TABLES;

const requireDatabase = () => {
  if (!databaseConfigured()) {
    throw new HttpError(503, 'Cloud sync is unavailable: this server has no database configured.', 'no_database');
  }
};

/** Records larger than this are almost certainly base64 images that belong on disk, not in a row. */
const MAX_RECORD_BYTES = 4 * 1024 * 1024;

const readRecords = (body: unknown, field: string): Array<ClothingItem | Fit> => {
  const value = (body as Record<string, unknown>)?.[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be an array`, 'bad_request');
  if (value.length > 500) throw new HttpError(413, `Too many ${field} in one request (max 500)`, 'too_many');
  for (const record of value) {
    const r = record as { id?: unknown; updatedAt?: unknown };
    if (!r || typeof r.id !== 'string' || !r.id) {
      throw new HttpError(400, `Every ${field} record needs a string id`, 'bad_request');
    }
    if (typeof r.updatedAt !== 'string') {
      throw new HttpError(400, `Every ${field} record needs an updatedAt timestamp`, 'bad_request');
    }
    if (JSON.stringify(record).length > MAX_RECORD_BYTES) {
      throw new HttpError(413, `A ${field} record is too large (limit 4 MB)`, 'too_large');
    }
  }
  return value as Array<ClothingItem | Fit>;
};

const pull = async (table: string, userId: string, since?: string): Promise<SyncRow[]> => {
  const { rows } = since
    ? await query<SyncRow>(
        `SELECT id, payload, updated_at, is_deleted FROM ${table}
          WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
        [userId, since],
      )
    : await query<SyncRow>(
        `SELECT id, payload, updated_at, is_deleted FROM ${table}
          WHERE user_id = $1 ORDER BY updated_at ASC`,
        [userId],
      );
  return rows;
};

const push = async (table: string, userId: string, records: Array<ClothingItem | Fit>): Promise<number> => {
  if (records.length === 0) return 0;
  return transaction(async (client) => {
    let written = 0;
    for (const record of records) {
      const { rowCount } = await client.query(
        `INSERT INTO ${table} (id, user_id, payload, updated_at, is_deleted)
           VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, id) DO UPDATE
           SET payload = EXCLUDED.payload,
               updated_at = EXCLUDED.updated_at,
               is_deleted = EXCLUDED.is_deleted
           -- Older writes are dropped rather than clobbering a newer record.
           WHERE ${table}.updated_at < EXCLUDED.updated_at`,
        [record.id, userId, JSON.stringify(record), record.updatedAt, Boolean(record.isDeleted)],
      );
      written += rowCount ?? 0;
    }
    return written;
  });
};

export const createSyncRouter = (): Router => {
  const router = express.Router();

  /** Everything changed since `?since=<ISO timestamp>`, or the whole account. */
  router.get('/sync', requireAuth, async (req, res) => {
    requireDatabase();
    const userId = currentUser(req).id;
    const since = typeof req.query.since === 'string' && req.query.since ? req.query.since : undefined;
    if (since && Number.isNaN(Date.parse(since))) {
      throw new HttpError(400, 'since must be an ISO timestamp', 'bad_request');
    }

    const [wardrobe, fits] = await Promise.all([
      pull(TABLES.wardrobe, userId, since),
      pull(TABLES.fits, userId, since),
    ]);

    res.json({
      serverTime: new Date().toISOString(),
      wardrobe: wardrobe.map((r) => r.payload),
      fits: fits.map((r) => r.payload),
    });
  });

  router.post('/sync', requireAuth, async (req, res) => {
    requireDatabase();
    const userId = currentUser(req).id;
    const wardrobe = readRecords(req.body, 'wardrobe');
    const fits = readRecords(req.body, 'fits');

    const [wardrobeWritten, fitsWritten] = await Promise.all([
      push(TABLES.wardrobe, userId, wardrobe),
      push(TABLES.fits, userId, fits),
    ]);

    res.json({
      serverTime: new Date().toISOString(),
      accepted: { wardrobe: wardrobeWritten, fits: fitsWritten },
      // Records the server ignored because it holds a newer copy.
      skipped: {
        wardrobe: wardrobe.length - wardrobeWritten,
        fits: fits.length - fitsWritten,
      },
    });
  });

  const collections: Collection[] = ['wardrobe', 'fits'];
  for (const collection of collections) {
    router.delete(`/sync/${collection}/:id`, requireAuth, async (req, res) => {
      requireDatabase();
      // Tombstone rather than DELETE, so other devices learn about the removal.
      const { rowCount } = await query(
        `UPDATE ${TABLES[collection]} SET is_deleted = TRUE, updated_at = NOW()
          WHERE user_id = $1 AND id = $2`,
        [currentUser(req).id, String(req.params.id)],
      );
      if (!rowCount) throw new HttpError(404, 'Not found', 'not_found');
      res.status(204).end();
    });
  }

  return router;
};
