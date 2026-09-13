import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { AiStylistResponse, GarmentJob, TryOnJob } from '@fitbuilder/core/contracts';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitbuilder-api-suite-'));
process.env.PROVIDERS = 'mock';
process.env.DATA_DIR = tmpDir;
process.env.JOB_CONCURRENCY = '3';
process.env.OLLAMA_URL = 'http://127.0.0.1:1';
// This suite covers endpoint behaviour, not entitlement, so give the dev
// account an allowance for the metered routes it exercises.
process.env.FREE_STYLIST_PER_MONTH = '50';
process.env.FREE_GARMENTS_PER_MONTH = '50';
process.env.FREE_TRYONS_PER_MONTH = '50';
process.env.FREE_STYLEFRAMES_PER_MONTH = '50';
delete process.env.FAL_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.WEATHER_API_KEY;
delete process.env.DATABASE_URL;

const { loadEnv } = await import('../config/env.js');
const { createApiServer } = await import('../server/index.js');

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const env = loadEnv();
let server: Awaited<ReturnType<typeof createApiServer>>;
let base = '';
let listener: import('node:http').Server;

const get = async (p: string) => {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, json: (await res.json()) as unknown };
};

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
    await new Promise((r) => setTimeout(r, 40));
  }
};

describe('API surface (mock providers)', () => {
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

  it('serves root discovery and health', async () => {
    const root = await get('/');
    assert.equal(root.status, 200);
    assert.equal((root.json as { health: string }).health, '/api/health');

    const health = await get('/api/health');
    assert.equal(health.status, 200);
    const body = health.json as {
      ok: boolean;
      version: string;
      providers: Record<string, boolean>;
      database?: { configured: boolean; ok?: boolean };
    };
    assert.equal(body.ok, true);
    assert.ok(body.version);
    assert.equal(body.providers.openai, false);
    assert.equal(body.database?.configured, false);
  });

  it('returns mock AI stylist suggestions when PROVIDERS=mock', async () => {
    const { status, json } = await post('/api/ai-stylist', {
      prompt: 'casual friday look',
      mode: 'chat',
      ownershipFilter: 'owned-only',
      wardrobe: [
        { id: 't1', name: 'White tee', category: 'top', color: 'white', weatherSuitability: ['warm'] },
        { id: 'b1', name: 'Blue jeans', category: 'bottom', color: 'blue', weatherSuitability: ['cool', 'warm'] },
      ],
    });
    assert.equal(status, 200);
    const body = json as AiStylistResponse;
    assert.ok(Array.isArray(body.suggestions));
    assert.ok(body.suggestions.length >= 1);
    assert.ok(body.suggestions[0].ownedItemIds?.length);
    assert.ok(body.suggestions[0].title);
  });

  it('rejects malformed stylist payloads', async () => {
    const bad = await post('/api/ai-stylist', { prompt: 12 });
    assert.equal(bad.status, 400);
  });

  it('requires lat/lon for weather and reports missing key', async () => {
    const missing = await get('/api/weather');
    assert.equal(missing.status, 400);

    const noKey = await get('/api/weather?lat=40.7&lon=-74');
    assert.equal(noKey.status, 503);
    assert.equal((noKey.json as { code: string }).code, 'no_provider');
  });

  it('runs layered try-on with bottom then top then outerwear', async () => {
    const { status, json } = await post('/api/tryon', {
      bodyImage: PNG_1x1,
      fitId: 'fit-layered',
      garments: [
        { itemId: 'outer', image: PNG_1x1, category: 'outerwear' },
        { itemId: 'top', image: PNG_1x1, category: 'top' },
        { itemId: 'bottom', image: PNG_1x1, category: 'bottom' },
      ],
    });
    assert.equal(status, 202);
    const done = await waitForJob<TryOnJob>((json as TryOnJob).id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.result?.fitId, 'fit-layered');
    assert.ok(done.result?.imageUrl.startsWith('data:image/'));
    assert.equal(done.result?.provider, 'mock');
  });

  it('feeds analysis into a sequential garment job before ghost', async () => {
    const { json } = await post('/api/garments/process', {
      image: PNG_1x1,
      itemId: 'seq-1',
      categoryHint: 'outerwear',
      options: { preferLocal: false },
    });
    const done = await waitForJob<GarmentJob>((json as GarmentJob).id);
    assert.equal(done.status, 'done', done.error);
    assert.ok(done.result?.analysis);
    assert.ok(done.result?.ghostImageUrl);
    // Mock analysis respects categoryHint when provided.
    assert.equal(done.result?.analysis?.category, 'outerwear');
  });

  it('runs concurrent garment jobs without cross-talk', async () => {
    const started = await Promise.all(
      ['a', 'b', 'c'].map((id) =>
        post('/api/garments/process', {
          image: PNG_1x1,
          itemId: `concurrent-${id}`,
          options: { cutout: true, analyze: true, ghost: true },
        }),
      ),
    );
    for (const s of started) assert.equal(s.status, 202);
    const done = await Promise.all(started.map((s) => waitForJob<GarmentJob>((s.json as GarmentJob).id)));
    for (const job of done) {
      assert.equal(job.status, 'done', job.error);
      assert.ok(job.result?.itemId?.startsWith('concurrent-'));
    }
    const ids = new Set(done.map((j) => j.result?.itemId));
    assert.equal(ids.size, 3);
  });

  it('rejects oversized styleframe view lists gracefully via validation', async () => {
    const bad = await post('/api/styleframe', {
      sourceImage: PNG_1x1,
      views: ['front', 'diagonal'],
    });
    assert.equal(bad.status, 400);
  });
});
