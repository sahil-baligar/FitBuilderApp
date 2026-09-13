import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Job, JobStatus } from '@fitbuilder/core/contracts';
import { log } from '../util/log.js';

/**
 * Jobs carry the id of the account that created them. Results hold the user's
 * own photos, so `/jobs/:id` must be able to prove ownership rather than
 * trusting an unguessable id.
 */
export type AnyJob = Job<unknown> & { userId?: string };
export type JobKind = AnyJob['kind'];

/**
 * In-memory job map mirrored to `<DATA_DIR>/jobs/<id>.json` so a restart keeps
 * finished results. Writes are atomic (tmp + rename) and serialised per job.
 */
export class JobStore {
  private readonly jobs = new Map<string, AnyJob>();
  private readonly writes = new Map<string, Promise<void>>();
  readonly dir: string;

  constructor(dataDir: string, private readonly ttlMs: number) {
    this.dir = path.join(dataDir, 'jobs');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Load persisted jobs. Anything that was still running when we died is marked failed. */
  async load(): Promise<void> {
    let files: string[] = [];
    try {
      files = (await fsp.readdir(this.dir)).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }
    let loaded = 0;
    for (const file of files) {
      try {
        const raw = await fsp.readFile(path.join(this.dir, file), 'utf8');
        const job = JSON.parse(raw) as AnyJob;
        if (!job?.id) continue;
        if (Date.now() - Date.parse(job.updatedAt) > this.ttlMs) {
          await this.remove(job.id);
          continue;
        }
        // Register before persisting: persist() skips jobs missing from the map
        // (so a deleted job's file is never rewritten), which would otherwise
        // leave the stale "processing" copy on disk forever.
        this.jobs.set(job.id, job);
        if (job.status === 'queued' || job.status === 'processing') {
          job.status = 'failed';
          job.error = 'Server restarted before the job finished';
          job.updatedAt = new Date().toISOString();
          await this.persist(job);
        }
        loaded += 1;
      } catch (err) {
        log.warn(`jobs: could not load ${file}`, err);
      }
    }
    if (loaded) log.info(`jobs: restored ${loaded} job(s) from ${this.dir}`);
  }

  create(kind: JobKind, userId?: string): AnyJob {
    const now = new Date().toISOString();
    const job: AnyJob = { id: randomUUID(), kind, userId, status: 'queued', progress: 0, createdAt: now, updatedAt: now };
    this.jobs.set(job.id, job);
    void this.persist(job);
    return job;
  }

  get(id: string): AnyJob | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Pick<AnyJob, 'status' | 'step' | 'progress' | 'result' | 'error'>>): AnyJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Unknown job ${id}`);
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    void this.persist(job);
    return job;
  }

  setStatus(id: string, status: JobStatus, extra?: { step?: string; progress?: number; error?: string }) {
    return this.update(id, { status, ...extra });
  }

  /** Drop jobs (and their files) whose last update is older than the TTL. */
  async evict(now = Date.now()): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (now - Date.parse(job.updatedAt) > this.ttlMs) {
        await this.remove(job.id);
        count += 1;
      }
    }
    if (count) log.info(`jobs: evicted ${count} expired job(s)`);
    return count;
  }

  async remove(id: string): Promise<void> {
    this.jobs.delete(id);
    await this.writes.get(id);
    await fsp.rm(this.file(id), { force: true });
  }

  /** Wait until all pending writes are flushed (used by tests and shutdown). */
  async flush(): Promise<void> {
    await Promise.all(this.writes.values());
  }

  private file(id: string) {
    return path.join(this.dir, `${id}.json`);
  }

  private persist(job: AnyJob): Promise<void> {
    const prev = this.writes.get(job.id) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        if (!this.jobs.has(job.id)) return;
        const target = this.file(job.id);
        const tmp = `${target}.${process.pid}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(job), 'utf8');
        await fsp.rename(tmp, target);
      })
      .catch((err) => log.warn(`jobs: failed to persist ${job.id}`, err));
    this.writes.set(job.id, next);
    return next;
  }
}
