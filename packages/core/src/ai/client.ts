import { getCoreConfig } from '../env';
import type { Fit } from '../types/models';
import type {
  AiStylistPayload,
  AiStylistResponse,
  AiStylistSuggestion,
  ApiErrorBody,
  GarmentJob,
  GarmentProcessRequest,
  HealthResponse,
  Job,
  StyleFrameJob,
  StyleFrameRequest,
  TryOnJob,
  TryOnRequest,
} from './contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const { apiBaseUrl } = getCoreConfig();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code);
  }
  return res.json() as Promise<T>;
};

const post = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const getHealth = () => request<HealthResponse>('/health');

export const requestAiSuggestions = (payload: AiStylistPayload) =>
  post<AiStylistResponse>('/ai-stylist', payload);

export const convertSuggestionToFit = (
  suggestion: AiStylistSuggestion,
): Omit<Fit, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: suggestion.title,
  itemIds: suggestion.ownedItemIds,
  suggestedItems: suggestion.suggestedItems,
  notes: suggestion.rationale,
  source: 'ai',
  weatherContext: undefined,
  occasion: undefined,
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const startGarmentJob = (payload: GarmentProcessRequest) =>
  post<GarmentJob>('/garments/process', payload);

export const startTryOnJob = (payload: TryOnRequest) => post<TryOnJob>('/tryon', payload);

export const startStyleFrameJob = (payload: StyleFrameRequest) =>
  post<StyleFrameJob>('/styleframe', payload);

export const getJob = <T,>(id: string) => request<Job<T>>(`/jobs/${encodeURIComponent(id)}`);

export interface PollOptions {
  /** ms between polls; default 1500. */
  intervalMs?: number;
  /** Give up after this long; default 4 minutes. */
  timeoutMs?: number;
  onUpdate?: (job: Job<unknown>) => void;
  signal?: AbortSignal;
}

/** Poll a job until it settles. Resolves with the finished job; rejects on failure or timeout. */
export const waitForJob = async <T,>(id: string, opts: PollOptions = {}): Promise<Job<T>> => {
  const interval = opts.intervalMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 4 * 60_000);
  for (;;) {
    if (opts.signal?.aborted) throw new ApiError('Cancelled', 499, 'cancelled');
    const job = await getJob<T>(id);
    opts.onUpdate?.(job);
    if (job.status === 'done') return job;
    if (job.status === 'failed') throw new ApiError(job.error ?? 'Job failed', 500, 'job_failed');
    if (Date.now() > deadline) throw new ApiError('Timed out waiting for job', 504, 'timeout');
    await new Promise((r) => setTimeout(r, interval));
  }
};

/** Convenience: start + wait. */
export const processGarment = async (payload: GarmentProcessRequest, opts?: PollOptions) => {
  const job = await startGarmentJob(payload);
  if (job.status === 'done' || job.status === 'failed') {
    if (job.status === 'failed') throw new ApiError(job.error ?? 'Job failed', 500, 'job_failed');
    return job;
  }
  return waitForJob<GarmentJob['result']>(job.id, opts) as Promise<GarmentJob>;
};

export const renderTryOn = async (payload: TryOnRequest, opts?: PollOptions) => {
  const job = await startTryOnJob(payload);
  return waitForJob<TryOnJob['result']>(job.id, opts) as Promise<TryOnJob>;
};

export const renderStyleFrames = async (payload: StyleFrameRequest, opts?: PollOptions) => {
  const job = await startStyleFrameJob(payload);
  return waitForJob<StyleFrameJob['result']>(job.id, opts) as Promise<StyleFrameJob>;
};
