import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from node:crypto.
 *
 * scrypt rather than argon2id purely for deployment reasons: argon2 needs a
 * native module, which means a compiler in the Docker image and frequent
 * breakage on Windows dev machines. scrypt is memory-hard, built into Node,
 * and an accepted choice under OWASP's password storage guidance.
 *
 * Parameters follow OWASP's scrypt recommendation (N=2^17, r=8, p=1), costing
 * roughly 130 MB and ~100 ms per hash. `maxmem` must be raised well above the
 * default 32 MB or Node refuses the work factor.
 */
const PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
const KEY_LEN = 64;
const SALT_LEN = 16;

/** Encoded as `scrypt$N$r$p$salt$hash`, so parameters can change without breaking old hashes. */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_LEN);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
};

/** True when a stored hash used weaker parameters and should be upgraded on next login. */
export const needsRehash = (stored: string): boolean => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < PARAMS.N;
};

export interface PasswordProblem {
  message: string;
}

/**
 * Length is the requirement that actually matters; composition rules push
 * people toward predictable substitutions. The upper bound exists because
 * scrypt hashes whatever it is given and a megabyte password is a cheap
 * denial-of-service.
 */
export const validatePassword = (password: string): PasswordProblem | undefined => {
  if (typeof password !== 'string' || password.length < 8) {
    return { message: 'Password must be at least 8 characters.' };
  }
  if (password.length > 200) {
    return { message: 'Password must be 200 characters or fewer.' };
  }
  return undefined;
};
