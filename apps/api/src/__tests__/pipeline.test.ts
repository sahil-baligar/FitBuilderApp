import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { GarmentJob, HealthResponse, StyleFrameJob, TryOnJob } from '@fitbuilder/core/contracts';

// Force offline providers and an isolated data dir BEFORE the env module loads.
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitbuilder-api-test-'));
process.env.PROVIDERS = 'mock';
process.env.DATA_DIR = tmpDir;
process.env.JOB_CONCURRENCY = '2';
process.env.OLLAMA_URL = 'http://127.0.0.1:1'; // unreachable on purpose
delete process.env.FAL_KEY;
delete process.env.OPENAI_API_KEY;

const { loadEnv } = await import('../config/env.js');
const { createApiServer } = await import('../server/index.js');

// 1x1 transparent PNG
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const env = loadEnv();
let server: Awaited<ReturnType<typeof createApiServer>>;
let base = '';
let listener: import('node:http').Server;

const post = async (p: string, body: unknown) => {
  const res = await fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as unknown };
};

const waitForJob = async <T,>(id: string, timeoutMs = 20_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${base}/api/jobs/${id}`);
    const job = (await res.json()) as { status: string; error?: string };
    if (job.status === 'done' || job.status === 'failed') return job as T;
    if (Date.now() > deadline) throw new Error('timed out waiting for job');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('pipeline (mock providers, offline)', () => {
  before(async () => {
    server = await createApiServer(env);
    await new Promise<void>((resolve) => {
      listener = server.app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = listener.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    base = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reports health with every cloud provider off', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const health = (await res.json()) as HealthResponse;
    assert.equal(health.ok, true);
    assert.equal(typeof health.version, 'string');
    assert.deepEqual(health.providers, { fal: false, openai: false, ollama: false, weather: false });
  });

  it('runs a garment job end to end and persists the result', async () => {
    const { status, json } = await post('/api/garments/process', {
      image: PNG_1x1,
      itemId: 'item-1',
      categoryHint: 'top',
    });
    assert.equal(status, 202);
    const job = json as GarmentJob;
    assert.equal(job.kind, 'garment');
    assert.ok(['queued', 'processing'].includes(job.status));

    const done = await waitForJob<GarmentJob>(job.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.progress, 1);
    assert.ok(done.result);
    assert.equal(done.result.itemId, 'item-1');
    assert.equal(done.result.originalImageUrl, PNG_1x1);
    assert.ok(done.result.cutoutImageUrl?.startsWith('data:image/png;base64,'));
    assert.ok(done.result.ghostImageUrl?.startsWith('data:image/png;base64,'));
    assert.equal(done.result.analysis?.category, 'top');
    assert.deepEqual(done.result.providers, { cutout: 'mock', analysis: 'mock', ghost: 'mock' });

    // Persisted to disk with the same content.
    await server.store.flush();
    const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'jobs', `${job.id}.json`), 'utf8'));
    assert.equal(onDisk.status, 'done');
    assert.equal(onDisk.result.itemId, 'item-1');
  });

  it('honours option flags', async () => {
    const { json } = await post('/api/garments/process', {
      image: PNG_1x1,
      options: { cutout: false, analyze: false, ghost: true },
    });
    const done = await waitForJob<GarmentJob>((json as GarmentJob).id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.result?.cutoutImageUrl, undefined);
    assert.equal(done.result?.analysis, undefined);
    assert.ok(done.result?.ghostImageUrl);
  });

  it('runs try-on and style-frame jobs', async () => {
    const tryon = await post('/api/tryon', {
      bodyImage: PNG_1x1,
      garments: [{ itemId: 'a', image: PNG_1x1, category: 'top' }],
      fitId: 'fit-1',
    });
    assert.equal(tryon.status, 202);
    const tryonDone = await waitForJob<TryOnJob>((tryon.json as TryOnJob).id);
    assert.equal(tryonDone.status, 'done', tryonDone.error);
    assert.equal(tryonDone.result?.fitId, 'fit-1');
    assert.ok(tryonDone.result?.imageUrl.startsWith('data:image/png'));

    const frames = await post('/api/styleframe', {
      sourceImage: PNG_1x1,
      views: ['side', 'back'],
      options: { background: 'studio' },
    });
    assert.equal(frames.status, 202);
    const framesDone = await waitForJob<StyleFrameJob>((frames.json as StyleFrameJob).id);
    assert.equal(framesDone.status, 'done', framesDone.error);
    assert.deepEqual(
      framesDone.result?.frames.map((f) => f.view),
      ['side', 'back'],
    );
  });

  it('validates input and unknown jobs', async () => {
    const bad = await post('/api/garments/process', { image: 'not-an-image' });
    assert.equal(bad.status, 400);
    assert.equal((bad.json as { code: string }).code, 'bad_request');

    const badCat = await post('/api/tryon', {
      bodyImage: PNG_1x1,
      garments: [{ image: PNG_1x1, category: 'hat' }],
    });
    assert.equal(badCat.status, 400);

    const missing = await fetch(`${base}/api/jobs/does-not-exist`);
    assert.equal(missing.status, 404);
  });
});
