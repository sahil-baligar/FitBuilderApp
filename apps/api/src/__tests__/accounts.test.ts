import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { newDb } from 'pg-mem';

/**
 * Account lifecycle against an in-memory Postgres, so signup, sessions,
 * password reset, deletion and per-account data isolation are exercised for
 * real rather than stubbed.
 */

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitbuilder-accounts-'));
process.env.PROVIDERS = 'mock';
process.env.DATA_DIR = tmpDir;
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.DATABASE_URL = 'postgres://test@localhost:5432/test';
process.env.AUTH_REQUIRED = 'true';
process.env.FREE_GARMENTS_PER_MONTH = '5';
delete process.env.RESEND_API_KEY; // emails are logged, not sent
delete process.env.FAL_KEY;
delete process.env.OPENAI_API_KEY;

// Build the in-memory database before the API touches the pool. The suite runs
// with cwd=apps/api under npm, and from the repo root when invoked directly.
const schemaPath = await (async () => {
  for (const candidate of ['db/schema.sql', '../../db/schema.sql', '../../../db/schema.sql']) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* next */
    }
  }
  throw new Error('Could not locate db/schema.sql');
})();
const schema = await fs.readFile(schemaPath, 'utf8');

const mem = newDb();
mem.registerExtension('pgcrypto', (s) =>
  s.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid' as never,
    // Without `impure`, pg-mem caches the result and every row gets the same
    // id, so the second insert collides on the primary key.
    impure: true,
    implementation: () => crypto.randomUUID(),
  }),
);
// The real db/schema.sql runs unmodified, partial expression index included.
mem.public.none(schema);

const { Pool } = mem.adapters.createPg();

const { setPool } = await import('../db/pool.js');
setPool(new Pool());

const { loadEnv } = await import('../config/env.js');
const { createApiServer } = await import('../server/index.js');

const env = loadEnv();
let server: Awaited<ReturnType<typeof createApiServer>>;
let listener: Server;
let base = '';

interface Res {
  status: number;
  json: Record<string, unknown>;
}

const call = async (method: string, p: string, body?: unknown, token?: string): Promise<Res> => {
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

const signup = async (email: string, password = 'correct-horse-battery') => {
  const res = await call('POST', '/auth/signup', { email, password });
  assert.equal(res.status, 201, `signup failed: ${JSON.stringify(res.json)}`);
  return res.json as { accessToken: string; refreshToken: string; account: { id: string; email: string } };
};

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

describe('signup and login', () => {
  it('creates an account and returns a usable session', async () => {
    const session = await signup('ada@example.com');
    assert.equal(session.account.email, 'ada@example.com');
    assert.ok(session.accessToken && session.refreshToken);

    const me = await call('GET', '/auth/me', undefined, session.accessToken);
    assert.equal(me.status, 200);
    assert.equal(me.json.email, 'ada@example.com');
    assert.equal(me.json.emailVerified, false);
    assert.equal(me.json.tier, 'free');
  });

  it('lowercases the email and rejects a duplicate', async () => {
    await signup('Grace@Example.com');
    const dup = await call('POST', '/auth/signup', { email: 'grace@example.com', password: 'another-password' });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.code, 'email_taken');
  });

  it('rejects a weak password and a malformed address', async () => {
    assert.equal((await call('POST', '/auth/signup', { email: 'a@b.co', password: 'short' })).status, 400);
    assert.equal((await call('POST', '/auth/signup', { email: 'not-an-email', password: 'long-enough-pw' })).status, 400);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await signup('linus@example.com');
    const wrongPw = await call('POST', '/auth/login', { email: 'linus@example.com', password: 'wrong-password' });
    const noUser = await call('POST', '/auth/login', { email: 'ghost@example.com', password: 'wrong-password' });
    assert.equal(wrongPw.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPw.json.error, noUser.json.error, 'must not reveal whether the account exists');
  });

  it('logs in with correct credentials', async () => {
    await signup('edsger@example.com', 'a-good-password');
    const res = await call('POST', '/auth/login', { email: 'edsger@example.com', password: 'a-good-password' });
    assert.equal(res.status, 200);
    assert.ok((res.json as { accessToken: string }).accessToken);
  });
});

describe('sessions', () => {
  it('rotates the refresh token and revokes the old one', async () => {
    const session = await signup('rotate@example.com');
    const first = await call('POST', '/auth/refresh', { refreshToken: session.refreshToken });
    assert.equal(first.status, 200);
    const next = first.json as { refreshToken: string; accessToken: string };
    assert.notEqual(next.refreshToken, session.refreshToken, 'refresh token must rotate');

    // Replaying the retired token is treated as a leak.
    const replay = await call('POST', '/auth/refresh', { refreshToken: session.refreshToken });
    assert.equal(replay.status, 401);
    assert.equal(replay.json.code, 'token_reused');

    // ...and that kills the rotated token too.
    const afterBreach = await call('POST', '/auth/refresh', { refreshToken: next.refreshToken });
    assert.equal(afterBreach.status, 401);
  });

  it('ends the session on logout', async () => {
    const session = await signup('logout@example.com');
    assert.equal((await call('POST', '/auth/logout', { refreshToken: session.refreshToken })).status, 204);
    assert.equal((await call('POST', '/auth/refresh', { refreshToken: session.refreshToken })).status, 401);
  });
});

describe('password reset', () => {
  it('answers identically for known and unknown addresses', async () => {
    await signup('reset@example.com');
    const known = await call('POST', '/auth/forgot-password', { email: 'reset@example.com' });
    const unknown = await call('POST', '/auth/forgot-password', { email: 'nobody@example.com' });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(known.json, unknown.json);
  });

  it('refuses an invalid reset token', async () => {
    const res = await call('POST', '/auth/reset-password', { token: 'made-up', password: 'a-new-password' });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'bad_token');
  });

  it('changes the password and signs other sessions out', async () => {
    const session = await signup('change@example.com', 'original-password');
    const changed = await call(
      'POST',
      '/auth/change-password',
      { currentPassword: 'original-password', password: 'replacement-password' },
      session.accessToken,
    );
    assert.equal(changed.status, 200);

    assert.equal((await call('POST', '/auth/refresh', { refreshToken: session.refreshToken })).status, 401);
    assert.equal(
      (await call('POST', '/auth/login', { email: 'change@example.com', password: 'replacement-password' })).status,
      200,
    );
    assert.equal(
      (await call('POST', '/auth/login', { email: 'change@example.com', password: 'original-password' })).status,
      401,
    );
  });

  it('rejects a change with the wrong current password', async () => {
    const session = await signup('guard@example.com', 'the-real-password');
    const res = await call(
      'POST',
      '/auth/change-password',
      { currentPassword: 'not-it', password: 'something-else-entirely' },
      session.accessToken,
    );
    assert.equal(res.status, 401);
  });
});

describe('sync isolation', () => {
  const item = (id: string, name: string) => ({
    id,
    name,
    imageUrl: '',
    category: 'top',
    color: 'navy',
    weatherSuitability: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('stores and returns a user own records', async () => {
    const session = await signup('owner@example.com');
    const push = await call('POST', '/sync', { wardrobe: [item('w1', 'Navy tee')] }, session.accessToken);
    assert.equal(push.status, 200);
    assert.equal((push.json.accepted as { wardrobe: number }).wardrobe, 1);

    const pull = await call('GET', '/sync', undefined, session.accessToken);
    assert.equal(pull.status, 200);
    assert.equal((pull.json.wardrobe as unknown[]).length, 1);
  });

  it('never returns another account records', async () => {
    const a = await signup('alice@example.com');
    const b = await signup('bob@example.com');
    await call('POST', '/sync', { wardrobe: [item('secret', 'Alice jacket')] }, a.accessToken);

    const pull = await call('GET', '/sync', undefined, b.accessToken);
    assert.equal(pull.status, 200);
    assert.equal((pull.json.wardrobe as unknown[]).length, 0, 'bob must not see alice data');
  });

  it('keeps the newer record when an older write arrives', async () => {
    const session = await signup('lww@example.com');
    const newer = { ...item('x1', 'Newer'), updatedAt: new Date(Date.now() + 60_000).toISOString() };
    const older = { ...item('x1', 'Older'), updatedAt: new Date(Date.now() - 60_000).toISOString() };

    await call('POST', '/sync', { wardrobe: [newer] }, session.accessToken);
    await call('POST', '/sync', { wardrobe: [older] }, session.accessToken);

    // Asserted on stored state rather than the response's `skipped` count:
    // pg-mem returns a row for a conditional DO UPDATE that changed nothing,
    // so its row count is misleading here. Real Postgres reports 0, and the
    // guard itself demonstrably worked since the newer record survived.
    const pull = await call('GET', '/sync', undefined, session.accessToken);
    const stored = (pull.json.wardrobe as Array<{ name: string }>)[0];
    assert.equal(stored.name, 'Newer', 'an older write must not overwrite a newer record');
  });

  it('rejects records with no id', async () => {
    const session = await signup('badrec@example.com');
    const res = await call('POST', '/sync', { wardrobe: [{ name: 'no id' }] }, session.accessToken);
    assert.equal(res.status, 400);
  });
});

describe('account deletion', () => {
  it('requires the password, then signs the account out everywhere', async () => {
    const session = await signup('bye@example.com', 'delete-me-please');

    const wrong = await call('DELETE', '/account', { password: 'not-the-password' }, session.accessToken);
    assert.equal(wrong.status, 401);

    const ok = await call('DELETE', '/account', { password: 'delete-me-please' }, session.accessToken);
    assert.equal(ok.status, 200);

    assert.equal((await call('POST', '/auth/refresh', { refreshToken: session.refreshToken })).status, 401);
    assert.equal(
      (await call('POST', '/auth/login', { email: 'bye@example.com', password: 'delete-me-please' })).status,
      401,
      'deleted account must not sign in',
    );
  });

  it('frees the email for reuse', async () => {
    const session = await signup('recycle@example.com', 'first-account-pw');
    await call('DELETE', '/account', { password: 'first-account-pw' }, session.accessToken);
    const again = await call('POST', '/auth/signup', { email: 'recycle@example.com', password: 'second-account-pw' });
    assert.equal(again.status, 201);
  });
});
