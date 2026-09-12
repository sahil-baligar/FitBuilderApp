# FitBuilder image pipeline

How wardrobe upload → ghost mannequin, try-on, and style frames map to providers, and how that relates to the reference repos under `_refs/` (study only).

## Upload → online wardrobe ghost

```
client upload
  → POST /api/garments/process  { image, categoryHint?, options? }
  → job: cutout → analysis → ghost → finalize
  → client stores cutoutImageUrl / ghostImageUrl / analysis on the wardrobe item
  → wardrobe UI + try-on prefer ghostImageUrl ?? cutoutImageUrl ?? imageUrl
    (see packages/core `layerImageFor`)
```

1. **Cutout** — RGBA background removal on the upload.
2. **Analysis** — ChatGPT vision catalogues colour, pattern, fit, etc. Runs **before** ghost when both are enabled so facts can steer the render prompt. Default is OpenAI first (`preferLocal` defaults to `false`). Pass `preferLocal: true` to try Ollama first on a developer machine.
3. **Ghost** — image-edit model turns the cutout into a white-background ghost mannequin. Prompt weaves `categoryHint` + analysis facts. Successful fal renders are cut out again so the client gets RGBA.
4. Stages may fail independently; the job only fails if every requested stage failed.

## Local vs fal (dev vs Railway)

| Capability   | Local / preferred when available              | Cloud (Railway)                        | Offline fallback |
|-------------|------------------------------------------------|----------------------------------------|------------------|
| Cutout      | BiRefNet ONNX (`LOCAL_CUTOUT_MODEL`) if no fal | fal BiRefNet (`FAL_KEY`)               | mock (echo)      |
| Analysis    | ChatGPT (`OPENAI_API_KEY`); Ollama if preferLocal | ChatGPT (`OPENAI_VISION_MODEL`)     | mock             |
| Ghost       | *not wired* (needs image-edit GPU service)     | fal nano-banana/edit                   | mock (echo)      |
| Try-on      | *not wired*                                    | fal FASHN try-on (layered)             | mock (composite) |
| Style frame | *not wired*                                    | fal nano-banana/edit (chained views)   | mock (echo)      |
| Stylist     | ChatGPT text model                             | ChatGPT (`OPENAI_TEXT_MODEL`)          | mock suggestions |
| Database    | optional local Postgres                        | Railway Postgres (`DATABASE_URL`)      | local-only store |

- **Developer machine:** set `OPENAI_API_KEY` for real analysis/stylist; Ollama + BiRefNet work without fal; ghost/try-on/styleframe stay mock until `FAL_KEY`.
- **Railway:** set `OPENAI_API_KEY` + `FAL_KEY` + `DATABASE_URL`. See `RAILWAY.md`.
- Force everything offline: `PROVIDERS=mock`.

## Reference repos → FitBuilder (licensing)

| Reference | What we took | What we did **not** do |
|-----------|--------------|-------------------------|
| `json-ghost-mannequin-pipeline` | Flow: analyze → weave sectioned facts into ghost prompt → render; hollow openings, white high-key product look, anti-invention guardrails. **Original FitBuilder prompt text.** | No vendored code/prompts copied verbatim. |
| `IMAGDressing` (research) | Conceptual: garment-conditioned generation + layering / controllable dress-up as a try-on *idea*. | **No weights, no code.** Research-only — not for commercial shipping. |
| `opentryon` (CC BY-NC) | Stage ordering ideas: segment/prep garment, then try-on; bottoms→tops→outerwear layering. | **Do not vendor.** NC license blocks commercial redistribution of that code. |
| `ai-style-frame` | Multi-view set: front / side / torso / back with identity + outfit lock across chained frames. **Original wording.** | No Gemini/Streamlit code copied. |

Commercial FitBuilder product: study references for prompts and flow only; ship fal + Ollama + MIT BiRefNet + mocks.

## Key source files

- Jobs: `src/jobs/garment.ts`, `tryon.ts`, `styleframe.ts`
- Providers: `src/providers/{fal,ollama,localCutout,openai,mock,index}.ts`
- Prompts: `src/prompts/{ghost,analysis,styleframe}.ts`
- Routing env: `src/config/env.ts`, `.env.example`, `src/config/models.ts`
