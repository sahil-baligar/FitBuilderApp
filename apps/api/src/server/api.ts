import express from 'express';
import type { AiStylistPayload, AiStylistResponse } from '@fitbuilder/core/contracts';
import type { Env } from '../config/env.js';
import { isOllamaReachable, ollamaGenerateJson } from '../providers/ollama.js';
import { openaiResponses } from '../providers/openai.js';
import { log } from '../util/log.js';

/**
 * The AI stylist prefers ChatGPT (OPENAI_API_KEY). Falls back to Ollama for
 * local-dev, then a deterministic mock when PROVIDERS=mock.
 */
export const createLegacyRouter = (env: Env) => {
  const router = express.Router();

  router.post('/ai-stylist', async (req, res) => {
    const body = req.body as AiStylistPayload;
    if (!body || typeof body.prompt !== 'string' || !Array.isArray(body.wardrobe)) {
      return res.status(400).json({ error: 'prompt and wardrobe are required', code: 'bad_request' });
    }
    const prompt = buildPrompt(body);

    try {
      let text: string;
      if (env.forceMock) {
        text = JSON.stringify({ suggestions: mockStylistSuggestions(body) });
      } else if (env.openaiKey) {
        text = await openaiResponses({
          apiKey: env.openaiKey,
          model: env.openaiTextModel,
          input: prompt,
          temperature: 0.6,
          json: true,
        });
      } else if (await isOllamaReachable(env.ollamaUrl)) {
        log.info(`ai-stylist: no OPENAI_API_KEY, using Ollama ${env.ollamaTextModel}`);
        text = await ollamaGenerateJson({
          baseUrl: env.ollamaUrl,
          timeoutMs: env.ollamaTimeoutMs,
          model: env.ollamaTextModel,
          prompt,
          temperature: 0.6,
        });
      } else {
        return res.status(503).json({
          error: 'No stylist backend available: set OPENAI_API_KEY (ChatGPT) or run Ollama',
          code: 'no_provider',
        });
      }
      const suggestions: AiStylistResponse['suggestions'] = parseAiResponse(text);
      res.json({ suggestions } satisfies AiStylistResponse);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'AI error' });
    }
  });

  router.get('/weather', async (req, res) => {
    const lat = req.query.lat as string | undefined;
    const lon = req.query.lon as string | undefined;
    if (!lat || !lon) {
      return res.status(400).json({ error: 'lat/lon required', code: 'bad_request' });
    }
    if (!env.weatherKey) {
      return res.status(503).json({ error: 'Missing weather key', code: 'no_provider' });
    }
    try {
      const url = new URL('https://api.openweathermap.org/data/2.5/weather');
      url.searchParams.set('lat', lat);
      url.searchParams.set('lon', lon);
      url.searchParams.set('appid', env.weatherKey);
      url.searchParams.set('units', 'metric');
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        main: { temp: number; humidity?: number };
        weather?: { main?: string }[];
        name?: string;
      };
      res.json({
        tempC: data.main.temp,
        condition: data.weather?.[0]?.main ?? 'Unknown',
        humidity: data.main.humidity,
        location: data.name,
        source: 'geo',
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Weather error' });
    }
  });

  return router;
};

const mockStylistSuggestions = (payload: AiStylistPayload): AiStylistResponse['suggestions'] => {
  const byCat = (cat: string) => payload.wardrobe.filter((i) => i.category === cat).map((i) => i.id);
  const tops = byCat('top');
  const bottoms = byCat('bottom');
  const owned = [...tops.slice(0, 1), ...bottoms.slice(0, 1)].filter(Boolean);
  return [
    {
      id: 'mock-1',
      title: owned.length ? 'Everyday essentials' : 'Starter look',
      rationale: `Mock suggestion for: ${payload.prompt.slice(0, 80)}`,
      ownedItemIds: owned.length ? owned : payload.wardrobe.slice(0, 2).map((i) => i.id),
      suggestedItems: [],
    },
  ];
};

const buildPrompt = (payload: AiStylistPayload) => {
  const wardrobe = payload.wardrobe
    .map(
      (item) =>
        `${item.id}: ${item.name} (${item.category}) - color: ${item.color}, weather: ${(item.weatherSuitability ?? []).join(', ')}`,
    )
    .join('\n');
  return `
You are FitForge, a stylist assistant. Suggest 3 outfits for the user.
User prompt: ${payload.prompt}
Mode: ${payload.mode}
Ownership filter: ${payload.ownershipFilter}
Weather: ${payload.weather ? `${payload.weather.tempC}C and ${payload.weather.condition}` : 'Unknown'}

Wardrobe (id: name):
${wardrobe}

Return JSON only, with an array "suggestions", each item having:
id (string), title, rationale, ownedItemIds (array of clothing IDs from the wardrobe above), suggestedItems (array of {tempId, category, color, description}).
`;
};

const parseAiResponse = (text: string): AiStylistResponse['suggestions'] => {
  try {
    const jsonStart = text.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('No JSON found');
    }
    const json = text.slice(jsonStart, text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as Partial<AiStylistResponse>;
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  } catch {
    return [];
  }
};
