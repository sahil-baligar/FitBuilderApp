import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';

/**
 * Exercises the real verification path against a local JWKS endpoint standing
 * in for Supabase, so token handling is tested rather than stubbed.
 */

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitbuilder-auth-test-'));
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

// Minimal JWKS server, started before the API reads its config.
const jwksServer: Server = createServer((req, res) => {
  if (req.url?.includes('jwks')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404).end();
});
await new Promise<void>((r) => jwksServer.listen(0, '127.0.0.1', r));
const jwksPort = (jwksServer.address() as { port: number }).port;
const issuer = `http://127.0.0.1:${jwksPort}`;

process.env.PROVIDERS = 'mock';
process.env.DATA_DIR = tmpDir;
process.env.SUPABASE_URL = issuer;
process.env.SUPABASE_JWKS_URL = `${issuer}/auth/v1/.well-known/jwks.json`;
process.env.AUTH_REQUIRED = 'true';
process.env.FREE_GARMENTS_PER_MONTH = '2';
process.env.FREE_TRYONS_PER_MONTH = '2';
process.env.FREE_STYLIST_PER_MONTH = '0';
delete process.env.FAL_KEY;
delete process.env.OPENAI_API_KEY;

const { loadEnv } = await import('../config/env.js');
const { createApiServer } = await import('../server/index.js');

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const env = loadEnv();
let server: Awaited<ReturnType<typeof createApiServer>>;
let listener: Server;
let base = '';

const tokenFor = async (sub: string, opts: { expired?: boolean; audience?: string } = {}) =>
  new SignJWT({ email: `${sub}@example.com`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject(sub)
    .setIssuer(`${issuer}/auth/v1`)
    .setAudience(opts.audience ?? 'authenticated')
    .setIssuedAt(opts.expired ? Math.floor(Date.now() / 1000) - 7200 : undefined)
    .setExpirationTime(opts.expired ? Math.floor(Date.now() / 1000) - 3600 : '1h')
    .sign(privateKey);

const call = async (p: string, token?: string, body?: unknown) => {
  const res = await fetch(`${base}${p}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
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
  await new Promise<void>((r) => jwksServer.close(() => r()));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('authentication', () => {
  it('leaves /health open', async () => {
    const { status, json } = await call('/health');
    assert.equal(status, 200);
    assert.deepEqual(json.auth, { required: true, configured: true });
  });

  it('rejects every metered endpoint without a token', async () => {
    for (const [p, body] of [
      ['/garments/process', garmentBody],
      ['/tryon', { bodyImage: PNG_1x1, garments: [{ itemId: 'a', image: PNG_1x1, category: 'top' }] }],
      ['/styleframe', { sourceImage: PNG_1x1, views: ['front'] }],
      ['/ai-stylist', { prompt: 'hi', wardrobe: [] }],
    ] as const) {
      const { status, json } = await call(p, undefined, body);
      assert.equal(status, 401, `${p} should require auth`);
      assert.equal(json.code, 'missing_token');
    }
    assert.equal((await call('/me/usage')).status, 401);
    assert.equal((await call('/weather?lat=1&lon=2')).status, 401);
  });

  it('rejects a forged token', async () => {
    const { privateKey: otherKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('attacker')
      .setIssuer(`${issuer}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(otherKey);
    const { status, json } = await call('/garments/process', forged, garmentBody);
    assert.equal(status, 401);
    assert.equal(json.code, 'invalid_token');
  });

  it('rejects an expired token and a wrong audience', async () => {
    const expired = await call('/me/usage', await tokenFor('u-exp', { expired: true }));
    assert.equal(expired.status, 401);
    assert.equal(expired.json.code, 'expired_token');

    const wrongAud = await call('/me/usage', await tokenFor('u-aud', { audience: 'someone-else' }));
    assert.equal(wrongAud.status, 401);
  });

  it('accepts a valid token', async () => {
    const { status, json } = await call('/me/usage', await tokenFor('user-ok'));
    assert.equal(status, 200);
    assert.equal(json.userId, 'user-ok');
    assert.equal(json.tier, 'free');
  });
});

describe('quotas', () => {
  it('counts usage and blocks past the free limit', async () => {
    const token = await tokenFor('user-quota');
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await call('/garments/process', token, garmentBody)).status, 202, `call ${i + 1}`);
    }
    const blocked = await call('/garments/process', token, garmentBody);
    assert.equal(blocked.status, 402);
    assert.equal(blocked.json.code, 'quota_exceeded');
    assert.equal((blocked.json.quota as { limit: number }).limit, 2);

    const usage = await call('/me/usage', token);
    const quota = usage.json.quota as Record<string, { used: number; remaining: number }>;
    assert.equal(quota.garments.used, 2);
    assert.equal(quota.garments.remaining, 0);
  });

  it('meters try-on per garment, not per request', async () => {
    const token = await tokenFor('user-tryon');
    // Limit is 2; a single call carrying 3 garments must not slip through.
    const res = await call('/tryon', token, {
      bodyImage: PNG_1x1,
      garments: ['a', 'b', 'c'].map((id) => ({ itemId: id, image: PNG_1x1, category: 'top' })),
    });
    assert.equal(res.status, 402);
    assert.equal((res.json.quota as { cost: number }).cost, 3);
  });

  it('treats the AI stylist as Pro-only at a zero free limit', async () => {
    const res = await call('/ai-stylist', await tokenFor('user-stylist'), { prompt: 'hi', wardrobe: [] });
    assert.equal(res.status, 402);
    assert.match(String(res.json.error), /Pro/);
  });

  it('keeps each account allowance separate', async () => {
    const fresh = await call('/me/usage', await tokenFor('user-separate'));
    const quota = fresh.json.quota as Record<string, { used: number }>;
    assert.equal(quota.garments.used, 0);
  });
});

describe('job ownership', () => {
  it('hides another account job behind a 404', async () => {
    const owner = await tokenFor('owner-1');
    const created = await call('/garments/process', owner, garmentBody);
    assert.equal(created.status, 202);
    const jobId = String(created.json.id);

    const mine = await call(`/jobs/${jobId}`, owner);
    assert.equal(mine.status, 200);

    const theirs = await call(`/jobs/${jobId}`, await tokenFor('intruder-1'));
    assert.equal(theirs.status, 404, 'another account must not read this job');
    assert.equal(theirs.json.code, 'job_not_found');
  });
});
