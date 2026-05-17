# FitBuilderApp

React + Vite PWA for building outfits from a personal wardrobe, with optional AI styling, weather context, local-first storage, and Supabase sync.

## Stack

| Layer | Tech |
| --- | --- |
| UI | React 18, React Router, Tailwind, shadcn/ui |
| Build | Vite 5, TypeScript, SWC |
| Data (local) | IndexedDB + `localStorage` via `src/lib/storage.ts` |
| Data (cloud) | Supabase Auth + Postgres tables (`wardrobe_items`, `fits`) |
| API (dev) | Express middleware mounted in Vite (`server/`) |
| AI / weather | OpenAI Responses API, OpenWeatherMap (keys server-side only) |

## Setup

```bash
npm install
cp env.example .env   # fill values (see below)
npm run dev           # http://localhost:8080 — Vite + /api proxy middleware
```

### Environment (`env.example` → `.env`)

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anon key (auth + sync) |
| `VITE_API_BASE_URL` | Client | API prefix; default `/api` (Vite middleware in dev) |
| `OPENAI_API_KEY` | Server only | AI stylist route |
| `WEATHER_API_KEY` | Server only | OpenWeatherMap proxy route |

`.env` is gitignored. Never commit secrets.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (port 8080) with API middleware |
| `npm run build` | Production static build → `dist/` |
| `npm run preview` | Serve `dist/` with same API middleware |
| `npm run lint` | ESLint |

## Architecture

```text
Browser (React)
  ├─ AppContext → repositories → storage (IDB/localStorage)
  ├─ aiService / weather → fetch → /api/* (Vite dev middleware)
  └─ supabaseClient → auth + sync (optional)

server/api.ts (Express router)
  ├─ POST /api/ai-stylist  → OpenAI
  └─ GET  /api/weather     → OpenWeatherMap
```

---

## File reference

### Root & config

| File | Purpose |
| --- | --- |
| `package.json` | Dependencies and npm scripts |
| `package-lock.json` | Locked dependency tree |
| `vite.config.ts` | Vite config; `@/` alias; mounts `createApiServer()` as dev/preview middleware |
| `tsconfig.json` | Root TS project references |
| `tsconfig.app.json` | App/browser TS config (`src/`) |
| `tsconfig.node.json` | Node TS config (`vite.config.ts`, `server/`) |
| `tailwind.config.ts` | Tailwind theme, content paths, shadcn tokens |
| `postcss.config.js` | PostCSS (Tailwind + autoprefixer) |
| `eslint.config.js` | ESLint flat config |
| `components.json` | shadcn/ui CLI paths and style |
| `index.html` | SPA shell, root mount |
| `env.example` | Committed env template (no secrets) |
| `.gitignore` | Ignores `node_modules`, `dist`, `.env`, caches, editor junk |

### `public/`

| File | Purpose |
| --- | --- |
| `robots.txt` | Crawler rules for deployed site |

### `server/` — API (runs inside Vite middleware, not a separate process)

| File | Purpose |
| --- | --- |
| `server/index.ts` | `createApiServer()` — Express app mounting router at `/api` |
| `server/api.ts` | Routes: `POST /ai-stylist` (OpenAI), `GET /weather` (lat/lon proxy); loads `dotenv` |

### `src/` — application entry

| File | Purpose |
| --- | --- |
| `src/main.tsx` | React 18 `createRoot` bootstrap |
| `src/App.tsx` | Router, providers (`QueryClient`, `AppProvider`, toasts), route table |
| `src/App.css` | App-level styles (if any beyond Tailwind) |
| `src/index.css` | Global Tailwind layers and CSS variables |
| `src/vite-env.d.ts` | Vite client type references |

### `src/types/`

| File | Purpose |
| --- | --- |
| `src/types/models.ts` | Domain types: `ClothingItem`, `Fit`, `UserPreferences`, `WeatherInfo`, sync/auth helpers |

### `src/contexts/`

| File | Purpose |
| --- | --- |
| `src/contexts/AppContext.tsx` | Global state: wardrobe, outfits, settings, weather, auth; CRUD wrappers; Supabase session + sync hooks |

### `src/lib/` — data & integrations

| File | Purpose |
| --- | --- |
| `src/lib/storage.ts` | `StorageDriver` abstraction: namespaced `localStorage` + IndexedDB (`idb`) |
| `src/lib/repositories.ts` | `WardrobeRepository`, `FitsRepository`, `PreferencesRepository`, `MetadataRepository` on top of storage |
| `src/lib/supabaseClient.ts` | Supabase JS client from `VITE_*` env (null if unset) |
| `src/lib/sync.ts` | `syncUp` / `syncDown` between local repos and Supabase tables |
| `src/lib/aiService.ts` | Client types + `requestAiSuggestions()` → `POST /api/ai-stylist` |
| `src/lib/weather.ts` | Client weather fetch via `/api/weather` or manual prefs |
| `src/lib/backgroundRemoval.ts` | `@imgly/background-removal` wrapper for wardrobe photo cutouts |
| `src/lib/utils.ts` | `cn()` — `clsx` + `tailwind-merge` for class names |

### `src/hooks/`

| File | Purpose |
| --- | --- |
| `src/hooks/use-toast.ts` | Toast state hook (used by shadcn Toaster) |
| `src/hooks/use-mobile.tsx` | Viewport breakpoint helper for responsive UI |

### `src/components/` — app UI

| File | Purpose |
| --- | --- |
| `src/components/BottomNav.tsx` | Mobile tab bar for main routes |
| `src/components/NavLink.tsx` | Router-aware nav link styling |
| `src/components/WeatherCard.tsx` | Current weather display; geo or manual |
| `src/components/OutfitPreview.tsx` | Layered outfit preview from selected wardrobe items |

### `src/components/ui/` — shadcn/ui primitives

Generated Radix-based components (`button`, `dialog`, `card`, `form`, etc.). Used across pages; extend via `components.json` / CLI, not business logic.

Notable duplicates: `use-toast.ts` re-exports hook for colocated imports.

### `src/pages/` — routes

| File | Purpose |
| --- | --- |
| `src/pages/Home.tsx` | Dashboard: stats, weather, quick actions |
| `src/pages/Wardrobe.tsx` | Add/edit/delete clothing; image upload + background removal |
| `src/pages/Build.tsx` | Manual outfit builder (pick items, save fit) |
| `src/pages/AIStylist.tsx` | AI outfit suggestions from wardrobe + weather context |
| `src/pages/Library.tsx` | Saved fits list and detail |
| `src/pages/Settings.tsx` | Preferences, weather mode, sync toggle, account |
| `src/pages/Index.tsx` | Legacy/alternate entry (if linked) |
| `src/pages/NotFound.tsx` | 404 route |
| `src/pages/auth/Login.tsx` | Supabase email/password login |
| `src/pages/auth/Signup.tsx` | Registration |

### Supabase (external)

Expected tables (see `src/lib/sync.ts`): `wardrobe_items`, `fits` with columns matching `ClothingItem` / `Fit` JSON shape. RLS and schema are not in this repo.

---

## Remote

Default push target: [github.com/sahil-baligar/FitBuilderApp](https://github.com/sahil-baligar/FitBuilderApp.git)
