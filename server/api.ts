import express from 'express';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';
import type { AiStylistPayload, AiStylistResponse } from '../src/lib/aiService';

dotenv.config();

const router = express.Router();
router.use(express.json({ limit: '10mb' }));

router.post('/ai-stylist', async (req, res) => {
  const body = req.body as AiStylistPayload;
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OpenAI key' });
  }

  try {
    const prompt = buildPrompt(body);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: prompt,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const result = await response.json();
    const suggestions: AiStylistResponse['suggestions'] = parseAiResponse(result.output_text ?? '');
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'AI error' });
  }
});

router.get('/weather', async (req, res) => {
  const lat = req.query.lat as string;
  const lon = req.query.lon as string;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat/lon required' });
  }
  if (!process.env.WEATHER_API_KEY) {
    return res.status(500).json({ error: 'Missing weather key' });
  }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`;
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }
    const data = await response.json();
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

const buildPrompt = (payload: AiStylistPayload) => {
  const wardrobe = payload.wardrobe
    .map(
      (item) =>
        `${item.name} (${item.category}) - color: ${item.color}, weather: ${item.weatherSuitability.join(', ')}`,
    )
    .join('\n');
  return `
You are FitForge, a stylist assistant. Suggest 3 outfits for the user.
User prompt: ${payload.prompt}
Mode: ${payload.mode}
Ownership filter: ${payload.ownershipFilter}
Weather: ${payload.weather ? `${payload.weather.tempC}C and ${payload.weather.condition}` : 'Unknown'}

Wardrobe:
${wardrobe}

Return JSON with an array "suggestions", each item having:
id (string), title, rationale, ownedItemIds (array of clothing IDs), suggestedItems (array of {tempId, category, color, description}).
`;
};

const parseAiResponse = (text: string): AiStylistResponse['suggestions'] => {
  try {
    const jsonStart = text.indexOf('{');
    if (jsonStart === -1) {
      throw new Error('No JSON found');
    }
    const json = text.slice(jsonStart);
    const parsed = JSON.parse(json) as AiStylistResponse;
    return parsed.suggestions ?? [];
  } catch {
    return [];
  }
};

export default router;

