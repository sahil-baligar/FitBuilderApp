import { errorMessage, log } from '../util/log.js';
import type { AnyJob, JobStore } from './store.js';

/** Handed to each runner so pipeline stages can report where they are. */
export interface JobContext {
  id: string;
  /** Update the human-readable step and the 0..1 progress. */
  progress(step: string, progress: number): void;
}

export type JobRunner<TResult> = (ctx: JobContext) => Promise<TResult>;

interface QueueEntry {
  job: AnyJob;
  run: JobRunner<unknown>;
}

/**
 * Minimal in-process queue: FIFO with a concurrency cap. Results and failures
 * are written straight into the store, which persists them.
 */
export class JobQueue {
  private readonly pending: QueueEntry[] = [];
  private active = 0;
  private readonly settled = new Map<string, Promise<void>>();

  constructor(private readonly store: JobStore, private readonly concurrency: number) {}

  enqueue<TResult>(job: AnyJob, run: JobRunner<TResult>): Promise<void> {
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    this.settled.set(job.id, done);
    this.pending.push({
      job,
      run: async (ctx) => {
        try {
          return await run(ctx);
        } finally {
          resolve();
        }
      },
    });
    this.pump();
    return done;
  }

  /** Resolves when the job has finished (either way). Useful in tests. */
  whenSettled(id: string): Promise<void> {
    return this.settled.get(id) ?? Promise.resolve();
  }

  get size() {
    return this.pending.length + this.active;
  }

  private pump() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const entry = this.pending.shift()!;
      this.active += 1;
      void this.execute(entry).finally(() => {
        this.active -= 1;
        this.settled.delete(entry.job.id);
        this.pump();
      });
    }
  }

  private async execute({ job, run }: QueueEntry) {
    const started = Date.now();
    this.store.setStatus(job.id, 'processing', { step: 'Starting', progress: 0.01 });
    const ctx: JobContext = {
      id: job.id,
      progress: (step, progress) => {
        if (this.store.get(job.id)?.status === 'processing') {
          this.store.update(job.id, { step, progress: Math.max(0, Math.min(1, progress)) });
        }
      },
    };
    try {
      const result = await run(ctx);
      this.store.update(job.id, { status: 'done', step: 'Done', progress: 1, result });
      log.info(`job ${job.kind} ${job.id} done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      const error = errorMessage(err);
      this.store.update(job.id, { status: 'failed', step: 'Failed', error });
      log.error(`job ${job.kind} ${job.id} failed: ${error}`);
    }
  }
}
