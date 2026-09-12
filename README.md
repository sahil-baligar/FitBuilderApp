# FitBuilder

Build outfits from your own wardrobe. Photograph a garment, FitBuilder turns it into a clean ghost-mannequin render, auto-tags it, and lets you compose fits, see them on your own photo, and generate multi-view style frames.

One codebase ships iOS, Android and mobile web (Expo), with a Node API on Railway.

## Layout

```text
packages/core     @fitbuilder/core — platform-agnostic domain logic (TS source, no build step)
apps/mobile       Expo + expo-router app: iOS, Android, and the web build hosted on Railway
apps/web          Original Vite/React PWA, kept as a fast test surface during the migration
apps/api          Standalone Express API: stylist, weather, garment pipeline, try-on, style frames
db/schema.sql     Railway Postgres tables for wardrobe + fits sync
railway.toml      Railway API service (Docker)
RAILWAY.md        Deploy guide (API + Postgres + Expo web)
```

### `packages/core`

| Module | Purpose |
| --- | --- |
| `types/models.ts` | `ClothingItem` (original / cutout / ghost images, `analysis`, `processing`), `Fit` (`renders`), prefs |
| `storage/` | `StorageDriver` contract, in-memory driver, `setStorageDriver()` registry. Platforms inject their driver. |
| `env.ts` | `setCoreConfig({ apiBaseUrl, supabaseUrl, supabaseAnonKey, ... })` injected by the platform |
| `repositories.ts` | Wardrobe / Fits / Preferences / Metadata on top of the registered driver |
| `supabaseClient.ts`, `sync.ts` | Optional cloud auth + sync |
| `ai/contracts.ts` | Wire types shared with `apps/api`: stylist, jobs, garment pipeline, try-on, style frames |
| `ai/client.ts` | Typed client + job polling (`processGarment`, `renderTryOn`, `renderStyleFrames`) |
| `outfit.ts` | Layer geometry as canvas fractions so web and native previews match |
| `context/AppContext.tsx` | App state + CRUD, platform-agnostic |
| `hooks/useGarmentPipeline.ts` | Runs the server pipeline for an item and keeps the record updated |

### Image pipeline (apps/api)

```text
upload ──► cutout (fal / local) ──► analysis (ChatGPT / Ollama) ──► ghost render (fal) ──► RGBA ghost
fit + body photo ──► try-on (fal) ──► style frames (fal, chained per view)
```

**ChatGPT** (`OPENAI_API_KEY`) is the primary model for garment analysis and the AI stylist. Every provider has a `mock` fallback so the whole app runs with no keys.

## Develop

All commands run from the repo root — the `app` folder, not its parent:

```bash
cd .../Code/FitBuilder/app

npm install                 # once
npm run dev:api             # http://localhost:8788 (PORT in apps/api/.env)
npm run dev:web             # http://localhost:8080 (proxies /api to the API)
npm run dev:mobile          # Expo on port 8085; press w for web, or scan the QR
npm test -w apps/api        # mock-provider pipeline + API surface tests
```

Expo's default port 8081 is taken on this machine by another project, so the mobile scripts pin 8085.

To run the app on a phone see **[TESTING-ON-PHONE.md](./TESTING-ON-PHONE.md)**. No Expo account is required for that.

Environment files: `apps/api/.env` (see `apps/api/.env.example`), `apps/mobile/.env` (see `apps/mobile/.env.example`). Never commit secrets.

## Deploy (Railway)

See **[RAILWAY.md](./RAILWAY.md)**. Short version: one Railway project with Postgres + API Docker service + Expo web Docker service. Set `OPENAI_API_KEY`, `FAL_KEY`, `DATABASE_URL`, and `CORS_ORIGINS`.

## Licensing notes

Commercial product. Reference repos studied but **not** vendored: OpenTryOn (CC BY-NC), IMAGDressing (research-only weights). All prompt wording is original.
