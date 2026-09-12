import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { ApiErrorBody } from '@fitbuilder/core/contracts';
import type { Env } from '../config/env.js';
import { JobQueue } from '../jobs/queue.js';
import { JobStore } from '../jobs/store.js';
import { createProviders } from '../providers/index.js';
import type { ProviderSet } from '../providers/types.js';
import { createPipelineRouter } from '../routes/pipeline.js';
import { HttpError } from '../routes/validate.js';
import { log } from '../util/log.js';
import { createLegacyRouter } from './api.js';
import pkg from '../../package.json' with { type: 'json' };

export interface ApiServer {
  app: Express;
  store: JobStore;
  queue: JobQueue;
  providers: ProviderSet;
  /** Stops the eviction timer and flushes pending job writes. */
  close(): Promise<void>;
}

/** Builds the Express app with all routes mounted under /api. */
export const createApiServer = async (env: Env, overrides?: { providers?: ProviderSet }): Promise<ApiServer> => {
  const store = new JobStore(env.dataDir, env.jobTtlMs);
  await store.load();
  const queue = new JobQueue(store, env.jobConcurrency);
  const providers = overrides?.providers ?? createProviders(env);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(
    cors({
      origin: env.corsOrigins === '*' ? true : env.corsOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '25mb' }));

  const api = express.Router();
  api.use(createPipelineRouter({ env, version: pkg.version, store, queue, providers }));
  api.use(createLegacyRouter(env));
  app.use('/api', api);

  app.get('/', (_req, res) => {
    res.json({ name: pkg.name, version: pkg.version, health: '/api/health' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'not_found' } satisfies ApiErrorBody);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, code: err.code } satisfies ApiErrorBody);
      return;
    }
    const e = err as { type?: string; status?: number; message?: string };
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body too large (limit 25 MB)', code: 'too_large' });
      return;
    }
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body', code: 'bad_json' });
      return;
    }
    log.error('unhandled error', err);
    res.status(e?.status && e.status >= 400 ? e.status : 500).json({
      error: e?.message ?? 'Internal error',
      code: 'internal',
    } satisfies ApiErrorBody);
  });

  const evictTimer = setInterval(() => void store.evict(), 60 * 60 * 1000);
  evictTimer.unref();

  return {
    app,
    store,
    queue,
    providers,
    async close() {
      clearInterval(evictTimer);
      await store.flush();
    },
  };
};
