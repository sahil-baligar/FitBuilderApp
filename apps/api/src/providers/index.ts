import type { Env } from '../config/env.js';
import { log } from '../util/log.js';
import { createFalCutout, createFalGhost, createFalStyleFrame, createFalTryOn } from './fal.js';
import { createLocalCutout } from './localCutout.js';
import { mockAnalysis, mockCutout, mockGhost, mockStyleFrame, mockTryOn } from './mock.js';
import { createOllamaAnalysis, isOllamaReachable } from './ollama.js';
import { createOpenAiAnalysis } from './openai.js';
import type { AnalysisProvider, CutoutProvider, ProviderSet } from './types.js';

/**
 * Picks an implementation for every capability from the environment.
 *
 *   cutout      fal (FAL_KEY) → local BiRefNet → mock
 *   analysis    ChatGPT/OpenAI first when OPENAI_API_KEY is set (unless preferLocal
 *               or ANALYSIS_PROVIDER=ollama). Ollama is a local-dev fallback.
 *   ghost       fal (FAL_KEY) → mock
 *   tryon       fal (FAL_KEY) → mock
 *   styleframe  fal (FAL_KEY) → mock
 *
 * Railway / cloud: set OPENAI_API_KEY + FAL_KEY. Local BiRefNet / Ollama are
 * for developer machines only.
 *
 * Whenever a real provider is replaced by the mock we log loudly.
 */

const loudMock = (capability: string, reason: string) =>
  log.loud(`${capability}: using MOCK provider (${reason}). Results are placeholders.`);

/**
 * Runs the mock if the real provider throws, so one bad image cannot fail a job.
 *
 * `name` is a getter that reports the provider that actually ran most recently.
 * Reporting the primary's name unconditionally would tell the client a real
 * cutout happened when it got the untouched input back.
 */
const wrapCutoutWithMockFallback = (primary: CutoutProvider): CutoutProvider => {
  let lastUsed = primary.name;
  return {
    get name() {
      return lastUsed;
    },
    async cutout(image) {
      try {
        const out = await primary.cutout(image);
        lastUsed = primary.name;
        return out;
      } catch (err) {
        log.error(`cutout via ${primary.name} failed; falling back to mock`, err);
        loudMock('cutout', `${primary.name} failed`);
        lastUsed = `mock (${primary.name} failed)`;
        return mockCutout.cutout(image);
      }
    },
  };
};

export const createProviders = (env: Env): ProviderSet => {
  const wantMock = (cap: keyof Env['providers']) => env.forceMock || env.providers[cap] === 'mock';
  const wantFal = (cap: keyof Env['providers']) =>
    !wantMock(cap) && Boolean(env.falKey) && (env.providers[cap] === 'auto' || env.providers[cap] === 'fal');

  // --- cutout --------------------------------------------------------------
  let cutout: CutoutProvider;
  if (wantMock('cutout')) {
    loudMock('cutout', 'CUTOUT_PROVIDER=mock or PROVIDERS=mock');
    cutout = mockCutout;
  } else if (wantFal('cutout')) {
    cutout = createFalCutout(env.falKey!);
  } else {
    if (env.providers.cutout === 'fal') log.warn('CUTOUT_PROVIDER=fal but FAL_KEY is missing; using local model');
    else log.info('cutout: FAL_KEY not set, using local BiRefNet (slow, CPU)');
    cutout = wrapCutoutWithMockFallback(
      createLocalCutout({ modelId: env.localCutoutModel, cacheDir: env.dataDir }),
    );
  }

  // --- analysis ------------------------------------------------------------
  const ollama = createOllamaAnalysis({
    baseUrl: env.ollamaUrl,
    model: env.ollamaVisionModel,
    timeoutMs: env.ollamaTimeoutMs,
  });
  const openai = env.openaiKey
    ? createOpenAiAnalysis({ apiKey: env.openaiKey, model: env.openaiVisionModel })
    : undefined;

  const analysis = async (preferLocal: boolean): Promise<AnalysisProvider[]> => {
    const choice = env.providers.analysis;
    if (wantMock('analysis')) {
      loudMock('analysis', 'ANALYSIS_PROVIDER=mock or PROVIDERS=mock');
      return [mockAnalysis];
    }
    const chain: AnalysisProvider[] = [];
    const ollamaUp = choice === 'openai' ? false : await isOllamaReachable(env.ollamaUrl);
    const useOllama = ollamaUp && choice !== 'openai';
    const useOpenAi = Boolean(openai) && choice !== 'ollama';

    // Default cloud path: ChatGPT first. preferLocal=true keeps Ollama ahead for offline/dev.
    if (useOpenAi && openai && (!preferLocal || !useOllama)) chain.push(openai);
    if (useOllama) chain.push(ollama);
    if (useOpenAi && openai && preferLocal && useOllama && !chain.includes(openai)) chain.push(openai);

    if (chain.length === 0) {
      loudMock(
        'analysis',
        `OPENAI_API_KEY missing${ollamaUp ? '' : ` and Ollama unreachable at ${env.ollamaUrl}`}`,
      );
      chain.push(mockAnalysis);
    }
    return chain;
  };

  // --- fal-only capabilities -----------------------------------------------
  const ghost = wantFal('ghost') ? createFalGhost(env.falKey!) : mockGhost;
  if (ghost === mockGhost) loudMock('ghost', wantMock('ghost') ? 'forced' : 'FAL_KEY missing');

  const tryon = wantFal('tryon') ? createFalTryOn(env.falKey!) : mockTryOn;
  if (tryon === mockTryOn) loudMock('tryon', wantMock('tryon') ? 'forced' : 'FAL_KEY missing');

  const styleframe = wantFal('styleframe') ? createFalStyleFrame(env.falKey!) : mockStyleFrame;
  if (styleframe === mockStyleFrame) {
    loudMock('styleframe', wantMock('styleframe') ? 'forced' : 'FAL_KEY missing');
  }

  log.info(
    `providers: cutout=${cutout.name} ghost=${ghost.name} tryon=${tryon.name} styleframe=${styleframe.name} ` +
      `analysis=[${
        env.forceMock
          ? 'mock'
          : `${openai ? openai.name : 'no-openai'}${`, ollama:${env.ollamaVisionModel}`}`
      }]`,
  );

  return { cutout, analysis, ghost, tryon, styleframe };
};

export type { ProviderSet } from './types.js';
