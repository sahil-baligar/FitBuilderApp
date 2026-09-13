import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SignJWT } from 'jose';
import { newDb } from 'pg-mem';

/**
 * Token handling, quota enforcement and job ownership, against real accounts
 * in an in-memory Postgres.
 */

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitbuilder-auth-'));
const SECRET = 'test-secret-at-least-32-characters-long!!';

process.env.PROVIDERS = 'mock';
process.env.DATA_DIR = tmpDir;
process.env.JWT_SECRET = SECRET;
process.env.DATABASE_URL = 'postgres://test@localhost:5432/test';
process.env.AUTH_REQUIRED = 'true';
process.env.FREE_GARMENTS_PER_MONTH = '2';
process.env.FREE_TRYONS_PER_MONTH = '2';
process.env.FREE_STYLEFRAMES_PER_MONTH = '2';
process.env.FREE_STYLIST_PER_MONTH = '0';
delete process.env.RESEND_API_KEY;
delete process.env.FAL_KEY;
delete process.env.OPENAI_API_KEY;

const schema = await fs.readFile(
  await (async () => {
    for (const p of ['db/schema.sql', '../../db/schema.sql', '../../../db/schema.sql']) {
      try {
        await fs.access(p);
        return p;
      } catch {
        /* next */
      }
    }
    return 'db/schema.sql';
  })(),
  'utf8',
);

const mem = newDb();
mem.registerExtension('pgcrypto', (s) =>
  s.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid' as never,
    impure: true,
    implementation: () => crypto.randomUUID(),
  }),
);
mem.public.none(schema);

const { setPool } = await import('../db/pool.js');
setPool(new (mem.adapters.createPg().Pool)());

const { loadEnv } = await import('../config/env.js');
const { createApiServer } = await import('../server/index.js');

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const env = loadEnv();
let server: Awaited<ReturnType<typeof createApiServer>>;
let listener: Server;
let base = '';

const call = async (method: string, p: string, body?: unknown, token?: string) => {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
};

/** Registers an account and returns its access token. */
const accountToken = async (email: string): Promise<string> => {
  const res = await call('POST', '/auth/signup', { email, password: 'a-sufficient-password' });
  assert.equal(res.status, 201, `signup failed: ${JSON.stringify(res.json)}`);
  return (res.json as { accessToken: string }).accessToken;
};

const garmentBody = { image: PNG_1x1, categoryHint: 'top' as const };

before(async () => {
  server = await createApiServer(env);
  listener = server.app.listen(0);
  await new Promise<void>((r) => listener.once('listening', r));
  base = `http://127.0.0.1:${(listener.address() as { port: number }).port}/api`;
});

after(async () => {
  await server.close();
  await new Promise<void>((r) => listener.close(() => r()));
  setPool(undefined);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('token handling', () => {
  it('leaves /health open and reports auth state', async () => {
    const { status, json } = await call('GET', '/health');
    assert.equal(status, 200);
    assert.deepEqual(json.auth, { required: true, configured: true });
  });

  it('rejects every protected endpoint without a token', async () => {
    const cases: Array<[string, string, unknown]> = [
      ['POST', '/garments/process', garmentBody],
      ['POST', '/tryon', { bodyImage: PNG_1x1, garments: [{ itemId: 'a', image: PNG_1x1, category: 'top' }] }],
      ['POST', '/styleframe', { sourceImage: PNG_1x1, views: ['front'] }],
      ['POST', '/ai-stylist', { prompt: 'hi', wardrobe: [] }],
      ['GET', '/me/usage', undefined],
      ['GET', '/sync', undefined],
      ['GET', '/weather?lat=1&lon=2', undefined],
      ['GET', '/auth/me', undefined],
    ];
    for (const [method, p, body] of cases) {
      const { status, json } = await call(method, p, body);
      assert.equal(status, 401, `${method} ${p} should require auth`);
      assert.equal(json.code, 'missing_token');
    }
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = await new SignJWT({ email: 'attacker@example.com' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(crypto.randomUUID())
      .setIssuer('fitbuilder-api')
      .setAudience('fitbuilder-app')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-completely-different-secret-value!!'));
    const { status, json } = await call('POST', '/garments/process', garmentBody, forged);
    assert.equal(status, 401);
    assert.equal(json.code, 'invalid_token');
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(crypto.randomUUID())
      .setIssuer('fitbuilder-api')
      .setAudience('fitbuilder-app')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(SECRET));
    const { status, json } = await call('GET', '/me/usage', undefined, expired);
    assert.equal(status, 401);
    assert.equal(json.code, 'expired_token');
  });

  it('rejects a token issued for a different audience', async () => {
    const wrongAud = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(crypto.randomUUID())
      .setIssuer('fitbuilder-api')
      .setAudience('some-other-app')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    assert.equal((await call('GET', '/me/usage', undefined, wrongAud)).status, 401);
  });

  it('accepts a token from a real signup', async () => {
    const token = await accountToken('valid@example.com');
    const { status, json } = await call('GET', '/me/usage', undefined, token);
    assert.equal(status, 200);
    assert.equal(json.tier, 'free');
  });
});

describe('quotas', () => {
  it('counts usage and blocks past the free limit', async () => {
    const token = await accountToken('quota@example.com');
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await call('POST', '/garments/process', garmentBody, token)).status, 202, `call ${i + 1}`);
    }
    const blocked = await call('POST', '/garments/process', garmentBody, token);
    assert.equal(blocked.status, 402);
    assert.equal(blocked.json.code, 'quota_exceeded');
    assert.equal((blocked.json.quota as { limit: number }).limit, 2);

    const usage = await call('GET', '/me/usage', undefined, token);
    const quota = usage.json.quota as Record<string, { used: number; remaining: number }>;
    assert.equal(quota.garments.used, 2);
    assert.equal(quota.garments.remaining, 0);
  });

  it('meters try-on per garment, not per request', async () => {
    const token = await accountToken('tryon@example.com');
    // Limit is 2, so one request carrying 3 garments must not slip through.
    const res = await call(
      'POST',
      '/tryon',
      { bodyImage: PNG_1x1, garments: ['a', 'b', 'c'].map((id) => ({ itemId: id, image: PNG_1x1, category: 'top' })) },
      token,
    );
    assert.equal(res.status, 402);
    assert.equal((res.json.quota as { cost: number }).cost, 3);
  });

  it('treats the AI stylist as Pro-only at a zero free limit', async () => {
    const res = await call('POST', '/ai-stylist', { prompt: 'hi', wardrobe: [] }, await accountToken('pro@example.com'));
    assert.equal(res.status, 402);
    assert.match(String(res.json.error), /Pro/);
  });

  it('keeps each account allowance separate', async () => {
    const spender = await accountToken('spender@example.com');
    await call('POST', '/garments/process', garmentBody, spender);

    const fresh = await call('GET', '/me/usage', undefined, await accountToken('fresh@example.com'));
    const quota = fresh.json.quota as Record<string, { used: number }>;
    assert.equal(quota.garments.used, 0);
  });
});

describe('job ownership', () => {
  it('hides another account job behind a 404', async () => {
    const owner = await accountToken('jobowner@example.com');
    const created = await call('POST', '/garments/process', garmentBody, owner);
    assert.equal(created.status, 202);
    const jobId = String(created.json.id);

    assert.equal((await call('GET', `/jobs/${jobId}`, undefined, owner)).status, 200);

    const intruder = await call('GET', `/jobs/${jobId}`, undefined, await accountToken('intruder@example.com'));
    assert.equal(intruder.status, 404, 'another account must not read this job');
    assert.equal(intruder.json.code, 'job_not_found');
  });
});
