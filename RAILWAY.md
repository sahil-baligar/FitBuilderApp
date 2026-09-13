# Deploy FitBuilder on Railway

Everything server-side runs on Railway: the API, the Postgres database, and accounts. There is no external identity provider.

The mobile app is **not** hosted here. Apple and Google distribute the iOS and Android binaries, built with EAS. Railway hosts only the API the app talks to, plus optionally the Expo web export.

```text
iOS app  ─┐
          ├─→  Railway API  ─→  Railway Postgres
Android  ─┘         │
                    ├─→ OpenAI      (stylist, garment analysis)
                    ├─→ fal.ai      (ghost mannequin, try-on, style frames)
                    └─→ OpenWeather (optional)
```

## 1. Create the project

1. **New Project → Deploy from GitHub repo**, pointing at `sahil-baligar/FitBuilderApp`.
2. **Add a Postgres database** to the same project. Railway injects `DATABASE_URL` into linked services automatically.
3. The API service builds from `apps/api/Dockerfile`; `railway.toml` at the repo root already declares this, along with the `/api/health` health check.

The database schema applies itself on every boot from `db/schema.sql`, so there is no migration step to run by hand. Every statement in that file is idempotent.

## 2. Environment variables

Set these in the API service's **Variables** tab. Never commit them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Injected by Railway when Postgres is linked. Accounts and sync need it. |
| `JWT_SECRET` | yes | Signs access tokens. Generate below. Changing it signs every user out. |
| `FAL_KEY` | yes | Ghost mannequin, try-on, style frames, cloud cutout |
| `OPENAI_API_KEY` | yes | AI stylist and garment analysis |
| `CORS_ORIGINS` | yes | Comma-separated. The app's origin; `*` is fine only while testing. |
| `APP_URL` | yes | Public app URL. Builds the links inside verification and reset emails. |
| `RESEND_API_KEY` | see below | Outbound email |
| `EMAIL_FROM` | with email | e.g. `FitBuilder <noreply@yourdomain.com>` |
| `WEATHER_API_KEY` | no | OpenWeatherMap |
| `NODE_ENV` | yes | `production`. The API refuses to start unauthenticated in this mode. |

Generate the signing key:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Without `RESEND_API_KEY`, password reset and email verification cannot work.** The API logs the message instead of sending it, so a user who forgets their password is locked out permanently. Set it before real users exist.

`PORT` is provided by Railway; do not set it.

## 3. Guardrails already in place

The API refuses to start in production unless `JWT_SECRET` and `DATABASE_URL` are both present, rather than silently serving unauthenticated. Every route except `/api/health` requires a valid session.

Free-tier allowances are enforced server-side, per account per calendar month. Tune them with variables if the defaults do not suit:

| Variable | Default | Action |
| --- | --- | --- |
| `FREE_GARMENTS_PER_MONTH` | 15 | Garments processed |
| `FREE_TRYONS_PER_MONTH` | 3 | Try-on renders, billed per garment |
| `FREE_STYLEFRAMES_PER_MONTH` | 3 | Style frames, billed per view |
| `FREE_STYLIST_PER_MONTH` | 0 | AI stylist, Pro-only at zero |
| `PRO_CEILING_PER_MONTH` | 500 | Fair-use ceiling for Pro accounts |

These matter because each action bills a provider per call. At fal's list rates a try-on is $0.075 and a ghost render $0.039, so an unbounded free tier is an unbounded bill.

## 4. Point the app at it

In `apps/mobile/.env` for a production build:

```bash
EXPO_PUBLIC_API_URL=https://your-api.up.railway.app
```

Leave it blank for local development: the app derives the API host from the Expo dev server, so a phone on the same Wi-Fi finds your laptop with no edits. See [TESTING-ON-PHONE.md](./TESTING-ON-PHONE.md).

## 5. Verify the deploy

```bash
curl https://your-api.up.railway.app/api/health
```

A healthy production response:

```json
{
  "ok": true,
  "version": "0.2.0",
  "providers": { "fal": true, "openai": true, "ollama": false, "weather": true },
  "database": { "configured": true, "ok": true },
  "auth": { "required": true, "configured": true }
}
```

Check each field. `database.ok` false means Postgres is not linked. `auth.configured` false means `JWT_SECRET` is missing and nobody can sign in. `ollama` is expected to be false in production; it is a local development convenience only.

Then confirm the account flow end to end:

```bash
curl -X POST https://your-api.up.railway.app/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"a-real-password"}'
```

A 201 with `accessToken` and `refreshToken` means accounts, the database and the schema are all working.

## 6. Local parity

```bash
# apps/api/.env
PORT=8788                 # 8787 is taken on this machine by another project
DATABASE_URL=             # blank runs without accounts; point at Railway Postgres to test them
JWT_SECRET=               # blank runs open, attributing every request to one dev user
FAL_KEY=...
OPENAI_API_KEY=...
```

With `DATABASE_URL` and `JWT_SECRET` blank the API runs open for local work and prints a loud warning. Quotas still apply, attributed to a single dev user. To exercise real accounts locally, point `DATABASE_URL` at the Railway Postgres instance and set a `JWT_SECRET`.
