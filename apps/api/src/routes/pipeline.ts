import express, { type Router } from 'express';
import type { HealthResponse, Job } from '@fitbuilder/core/contracts';
import type { Env } from '../config/env.js';
import { checkDatabase } from '../db/client.js';
import { runGarmentJob } from '../jobs/garment.js';
import type { JobQueue } from '../jobs/queue.js';
import type { JobStore } from '../jobs/store.js';
import { runStyleFrameJob } from '../jobs/styleframe.js';
import { runTryOnJob } from '../jobs/tryon.js';
import { isOllamaReachable } from '../providers/ollama.js';
import type { ProviderSet } from '../providers/types.js';
import { HttpError, parseGarmentRequest, parseStyleFrameRequest, parseTryOnRequest } from './validate.js';

export interface PipelineDeps {
  env: Env;
  version: string;
  store: JobStore;
  queue: JobQueue;
  providers: ProviderSet;
}

/** Routes for the async image pipeline plus /health. */
export const createPipelineRouter = ({ env, version, store, queue, providers }: PipelineDeps): Router => {
  const router = express.Router();

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
    };
    res.json(body);
  });

  router.post('/garments/process', (req, res) => {
    const payload = parseGarmentRequest(req.body);
    const job = store.create('garment');
    void queue.enqueue(job, (ctx) => runGarmentJob(payload, providers, ctx));
    res.status(202).json(job);
  });

  router.post('/tryon', (req, res) => {
    const payload = parseTryOnRequest(req.body);
    const job = store.create('tryon');
    void queue.enqueue(job, (ctx) => runTryOnJob(payload, providers, ctx));
    res.status(202).json(job);
  });

  router.post('/styleframe', (req, res) => {
    const payload = parseStyleFrameRequest(req.body);
    const job = store.create('styleframe');
    void queue.enqueue(job, (ctx) => runStyleFrameJob(payload, providers, ctx));
    res.status(202).json(job);
  });

  router.get('/jobs/:id', (req, res) => {
    const job: Job<unknown> | undefined = store.get(String(req.params.id));
    if (!job) throw new HttpError(404, 'Job not found', 'job_not_found');
    res.json(job);
  });

  return router;
};
