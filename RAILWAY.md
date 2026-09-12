# Deploy FitBuilder on Railway

FitBuilder runs as **three Railway resources** in one project:

1. **Postgres** — persistent wardrobe/fits schema (`db/schema.sql`)
2. **API** — Express image pipeline + ChatGPT stylist (`apps/api`, Docker)
3. **Web** — Expo mobile web export (`apps/mobile`, Docker + `serve`)

## 1. Create the project

1. [railway.app](https://railway.app) → New Project → Empty Project
2. **Add Postgres**: New → Database → PostgreSQL  
   Railway injects `DATABASE_URL` into linked services.
3. **Add API service**: New → GitHub Repo (this repo)  
   - Root directory: repo root (the folder that contains `apps/` and `packages/`)  
   - Config: use root `railway.toml` (Dockerfile `apps/api/Dockerfile`)  
   - Variables (API service):

| Variable | Value |
| --- | --- |
| `OPENAI_API_KEY` | Your ChatGPT / OpenAI key (**required** for stylist + garment analysis) |
| `OPENAI_TEXT_MODEL` | `gpt-4.1-mini` (default) |
| `OPENAI_VISION_MODEL` | `gpt-4.1-mini` (default) |
| `FAL_KEY` | fal.ai key for ghost / try-on / style frames / cutout |
| `DATABASE_URL` | Reference the Postgres plugin variable |
| `CORS_ORIGINS` | Your web service public URL (e.g. `https://fitbuilder-web.up.railway.app`) |
| `DATA_DIR` | `/data` |
| `NODE_ENV` | `production` |

4. Attach a **volume** to the API at `/data` so job records survive restarts (optional but recommended).

5. **Apply schema** once (Railway Postgres → Query / or local `psql`):

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

6. **Add Web service**: second GitHub service  
   - Config: `apps/mobile/railway.toml`  
   - Variable: `EXPO_PUBLIC_API_URL=https://<your-api>.up.railway.app`  
   - Generate a public domain for both API and Web.

## 2. AI defaults

- **ChatGPT** is the primary model for garment analysis and the AI stylist when `OPENAI_API_KEY` is set.
- Ollama remains an optional local-dev fallback (`preferLocal: true` on a garment job, or `ANALYSIS_PROVIDER=ollama`).
- Ghost mannequin / try-on / style frames still need **`FAL_KEY`** on Railway (no GPU for local BiRefNet there).

## 3. Local parity

```bash
# apps/api/.env
OPENAI_API_KEY=sk-...
FAL_KEY=...
# optional Railway Postgres locally:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fitbuilder

# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:8788
```

## 4. Health check

`GET /api/health` returns provider flags plus:

```json
{ "database": { "configured": true, "ok": true } }
```

when `DATABASE_URL` is set and Postgres answers.
