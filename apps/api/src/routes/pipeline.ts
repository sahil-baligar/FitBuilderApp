import express, { type Request, type Router } from 'express';
import type { HealthResponse } from '@fitbuilder/core/contracts';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { authConfigured } from '../auth/verify.js';
import type { Env } from '../config/env.js';
import { checkDatabase } from '../db/client.js';
import { runGarmentJob } from '../jobs/garment.js';
import type { JobQueue } from '../jobs/queue.js';
import type { AnyJob, JobStore } from '../jobs/store.js';
import { runStyleFrameJob } from '../jobs/styleframe.js';
import { runTryOnJob } from '../jobs/tryon.js';
import { isOllamaReachable } from '../providers/ollama.js';
import type { ProviderSet } from '../providers/types.js';
import { entitlementFor, enforceQuota, summarize } from '../usage/quota.js';
import { periodResetsAt, type UsageStore } from '../usage/store.js';
import { HttpError, parseGarmentRequest, parseStyleFrameRequest, parseTryOnRequest } from './validate.js';

export interface PipelineDeps {
  env: Env;
  version: string;
  store: JobStore;
  queue: JobQueue;
  providers: ProviderSet;
  usage: UsageStore;
}

/** Routes for the async image pipeline, account usage, and /health. */
export const createPipelineRouter = ({ env, version, store, queue, providers, usage }: PipelineDeps): Router => {
  const router = express.Router();

  // --- public ---------------------------------------------------------------

  router.get('/health', async (_req, res) => {
    const ollama = env.forceMock ? false : await isOllamaReachable(env.ollamaUrl, 2000);
    const database = await checkDatabase(env.databaseUrl);
    const body: HealthResponse = {
      ok: true,
      version,
      providers: {
        fal: Boolean(env.falKey) && !env.forceMock,
        openai: Boolean(env.openaiKey) && !env.forceMock,
        ollama,
        weather: Boolean(env.weatherKey),
      },
      database,
      auth: { required: env.authRequired, configured: authConfigured() },
    };
    res.json(body);
  });

  // --- account --------------------------------------------------------------

  router.get('/me/usage', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const [record, entitlement] = await Promise.all([usage.snapshot(user.id), entitlementFor(user.id)]);
    res.json({
      userId: user.id,
      tier: entitlement.tier,
      expiresAt: entitlement.expiresAt,
      period: record.period,
      resetsAt: periodResetsAt(),
      quota: summarize(record.counts, entitlement.tier),
    });
  });

  // --- metered pipeline -----------------------------------------------------

  router.post(
    '/garments/process',
    requireAuth,
    enforceQuota(usage, { action: 'garments' }),
    (req, res) => {
      const payload = parseGarmentRequest(req.body);
      const job = store.create('garment', currentUser(req).id);
      void queue.enqueue(job, (ctx) => runGarmentJob(payload, providers, ctx));
      res.status(202).json(job);
    },
  );

  router.post(
    '/tryon',
    requireAuth,
    // Try-on bills once per garment because the provider is called per garment.
    enforceQuota(usage, { action: 'tryons', cost: (req: Request) => countOf(req.body?.garments) }),
    (req, res) => {
      const payload = parseTryOnRequest(req.body);
      const job = store.create('tryon', currentUser(req).id);
      void queue.enqueue(job, (ctx) => runTryOnJob(payload, providers, ctx));
      res.status(202).json(job);
    },
  );

  router.post(
    '/styleframe',
    requireAuth,
    // One generated image per requested view.
    enforceQuota(usage, { action: 'styleframes', cost: (req: Request) => countOf(req.body?.views) }),
    (req, res) => {
      const payload = parseStyleFrameRequest(req.body);
      const job = store.create('styleframe', currentUser(req).id);
      void queue.enqueue(job, (ctx) => runStyleFrameJob(payload, providers, ctx));
      res.status(202).json(job);
    },
  );

  router.get('/jobs/:id', requireAuth, (req, res) => {
    const job: AnyJob | undefined = store.get(String(req.params.id));
    // Same 404 whether the job is absent or someone else's: a different status
    // would confirm the id exists, and results carry the owner's photos.
    if (!job || (job.userId && job.userId !== currentUser(req).id)) {
      throw new HttpError(404, 'Job not found', 'job_not_found');
    }
    res.json(job);
  });

  return router;
};

/** Number of billable units in a request array, floored at 1. */
const countOf = (value: unknown): number => (Array.isArray(value) && value.length > 0 ? value.length : 1);
