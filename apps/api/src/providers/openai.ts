import type { ClothingCategory, GarmentAnalysis } from '@fitbuilder/core/contracts';
import { buildAnalysisPrompt, coerceAnalysis, extractJson } from '../prompts/analysis.js';
import { loadImage, toDataUrl, toVisionJpeg } from '../util/image.js';
import { log } from '../util/log.js';
import type { AnalysisProvider } from './types.js';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

interface ResponsesResult {
  output_text?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  error?: { message?: string };
}

/** The Responses API only sets `output_text` in SDKs; assemble it from `output` here. */
const responseText = (r: ResponsesResult): string => {
  if (typeof r.output_text === 'string') return r.output_text;
  const parts: string[] = [];
  for (const item of r.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if ((c.type === 'output_text' || c.type === 'text') && c.text) parts.push(c.text);
    }
  }
  return parts.join('\n');
};

/** Plain-text Responses call used by the AI stylist and the vision analysis. */
export const openaiResponses = async (opts: {
  apiKey: string;
  model: string;
  input: unknown;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
}): Promise<string> => {
  const started = Date.now();
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    body: JSON.stringify({
      model: opts.model,
      input: opts.input,
      temperature: opts.temperature ?? 0.2,
      ...(opts.json ? { text: { format: { type: 'json_object' } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = (await res.json()) as ResponsesResult;
  if (data.error?.message) throw new Error(`OpenAI: ${data.error.message}`);
  log.info(`openai ${opts.model} replied in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return responseText(data);
};

export const createOpenAiAnalysis = (opts: { apiKey: string; model?: string }): AnalysisProvider => {
  const model = opts.model ?? 'gpt-4.1-mini';
  return {
    name: `openai:${model}`,
    async analyze(image, hint?: ClothingCategory): Promise<GarmentAnalysis> {
      const { buffer } = await loadImage(image);
      const jpeg = await toVisionJpeg(buffer, 1024);
      const text = await openaiResponses({
        apiKey: opts.apiKey,
        model,
        json: true,
        temperature: 0.1,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: buildAnalysisPrompt(hint) },
              { type: 'input_image', image_url: toDataUrl(jpeg, 'image/jpeg'), detail: 'low' },
            ],
          },
        ],
      });
      return coerceAnalysis(extractJson(text), 'cloud-vlm', hint);
    },
  };
};
