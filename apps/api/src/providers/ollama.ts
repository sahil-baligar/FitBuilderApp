import type { ClothingCategory, GarmentAnalysis } from '@fitbuilder/core/contracts';
import { buildAnalysisPrompt, coerceAnalysis, extractJson } from '../prompts/analysis.js';
import { loadImage, toVisionJpeg } from '../util/image.js';
import { log } from '../util/log.js';
import type { AnalysisProvider } from './types.js';

export interface OllamaOptions {
  baseUrl: string;
  timeoutMs: number;
}

/** GET /api/tags with a short timeout; used by /health and provider selection. */
export const isOllamaReachable = async (baseUrl: string, timeoutMs = 2000): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
};

interface GenerateResponse {
  response?: string;
  error?: string;
}

/** Ollama /api/generate with `format: "json"`; returns the raw text of the reply. */
export const ollamaGenerateJson = async (
  opts: OllamaOptions & { model: string; prompt: string; images?: string[]; temperature?: number },
): Promise<string> => {
  const started = Date.now();
  const res = await fetch(`${opts.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs),
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      images: opts.images,
      format: 'json',
      stream: false,
      options: { temperature: opts.temperature ?? 0.1 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as GenerateResponse;
  if (data.error) throw new Error(`Ollama: ${data.error}`);
  log.info(`ollama ${opts.model} replied in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return data.response ?? '';
};

export const createOllamaAnalysis = (opts: OllamaOptions & { model: string }): AnalysisProvider => ({
  name: `ollama:${opts.model}`,
  async analyze(image, hint?: ClothingCategory): Promise<GarmentAnalysis> {
    const { buffer } = await loadImage(image);
    const jpeg = await toVisionJpeg(buffer, 768);
    const text = await ollamaGenerateJson({
      ...opts,
      prompt: buildAnalysisPrompt(hint),
      images: [jpeg.toString('base64')],
    });
    return coerceAnalysis(extractJson(text), 'local-vlm', hint);
  },
});
