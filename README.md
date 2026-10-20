# pricetrack

Search once, compare prices at official stores (Amazon, Best Buy, Walmart,
Target, Newegg, Costco, B&H, GameStop and more), and track favorites on a
dashboard that re-checks prices in the background.

```
apps/
  web/        React 19 + Vite + Tailwind CSS v4 + TanStack Query   (http://localhost:5173)
  api/        Express 5 + PostgreSQL + Redis + BullMQ worker        (http://localhost:4000)
packages/
  shared/     Types, validation, product matching and best-price logic used by both apps
docker-compose.yml   Postgres + Redis for development; full stack with --profile app
```

One repository, one `npm install`, one `npm run dev`. Turborepo runs tasks
across the workspaces and caches builds.

## Quick start

Prerequisites: Node 22+, Docker Desktop (running).

```bash
npm install
npm run setup          # creates .env with a random JWT secret
npm run services:up    # starts Postgres (port 5433) and Redis (6379) in Docker
npm run dev            # API + worker + web app, with hot reload
```

Open http://localhost:5173. Database migrations run automatically on start.

Add your API keys to `.env` (see "Price sources"). With no keys at all you can
still try everything by setting `DEMO_MODE=true`, which adds a fake store with
clearly labeled demo prices.

| Command | What it does |
| --- | --- |
| `npm run dev` | Run everything in development |
| `npm test` | Unit tests + API integration tests (needs `services:up`) |
| `npm run typecheck` | Type-check every package |
| `npm run build` | Production build of the API and web app |
| `npm run db:migrate` | Apply database migrations manually |
| `docker compose --profile app up --build` | Run the full production stack in containers on http://localhost:4000 |

## Price sources

Each source is optional; a missing key just turns that source off, and the
search page shows which sources are active.

| Stores | How | Key in `.env` | Cost |
| --- | --- | --- | --- |
| Best Buy, Walmart, Target, Newegg, Costco, B&H, GameStop, PlayStation Direct, Apple, Dell, ... | Google Shopping via the "Real-Time Product Search" API (RapidAPI or OpenWeb Ninja) | `RAPIDAPI_KEY` (after subscribing) or `OPENWEBNINJA_API_KEY` | 100 requests/month free, then paid |
| Amazon | "Price Analytics" API on RapidAPI | `RAPIDAPI_KEY` | Free tier |
| Best Buy (direct, optional) | Official [Best Buy Products API](https://developer.bestbuy.com) | `BESTBUY_API_KEY` | Free, but approval required |

Best Buy's own API needs an approved developer account. Without it you still
get Best Buy prices through Google Shopping; the direct API just adds UPCs and
model numbers, which make cross-store matching more accurate.

**Watch the quota.** Each search costs one Google Shopping request, plus one
per product whose store-by-store prices are fetched up front
(`SHOPPING_OFFERS_PREFETCH`, default 2). On the free 100/month plan that's
about 33 searches. Set it to `0` to spend one request per search and load
store prices only when a product is opened. Results are cached for 30 minutes,
so repeating a search is free.

Why not scrape the stores directly? It breaks their terms of service, gets
blocked by bot protection, and breaks whenever a page layout changes. Walmart,
Target and Newegg don't offer a practical public product API, so a Google
Shopping data provider is the reliable way to cover them. Google also groups
the same product across stores, which is the best cross-store matching
available.

Amazon's official Product Advertising API requires an Associates account with
recent qualifying sales. If you get one, it can replace the RapidAPI source
(add a new file in `apps/api/src/sources/`).

## How search and "best price" work

1. **Parallel search.** Every enabled source is queried at once. The API waits
   up to 2.5 s, returns whatever is ready, and marks the response `pending`;
   the web app polls until everything has arrived. Slow sources (Amazon takes
   3–20 s) never block fast ones.
2. **Matching.** Google Shopping products are the anchors. Best Buy and Amazon
   listings attach to them by UPC, model number, or title similarity
   (`packages/shared/src/matching.ts`). Matching is conservative: a different
   model number, storage size, screen size, or variant word (Pro, Mini,
   Digital vs Disc, Bundle, Controller, ...) always prevents a match.
3. **Best price** (`packages/shared/src/best-price.ts`). Only a new-condition,
   in-stock, same-currency offer with a real price can win. Used, renewed,
   out-of-stock offers and `$0` placeholders are shown but never win. Marketplace
   resellers ("Walmart - SomeSeller", "Amazon.com - Seller") are dropped.
4. **Confirming Amazon prices.** Amazon search results can show a *used*
   seller's price, so they're marked "≈ unconfirmed" until the ASIN is looked
   up exactly; confirmed prices always rank above unconfirmed ones.

## Performance and reliability

- **Redis cache** for search results (30 min) with single-flight: ten people
  searching the same thing at once cause one upstream call. Failures are
  cached for 60 s so a broken source isn't hammered.
- **Per-source rate limiter + circuit breaker** (`apps/api/src/resilience.ts`).
  After repeated failures a source is skipped for a minute; a bad key or
  missing subscription disables it for 10 minutes with a clear message.
- **Retries** with exponential backoff that honor `Retry-After`.
- If Redis is down, the app keeps working without the cache.

## Background worker

`apps/api/src/worker.ts` (BullMQ on Redis). Every 15 minutes a sweep finds
favorited products whose prices are older than `REFRESH_INTERVAL_HOURS`
(default 6) and queues one refresh job per product, deduplicated. Jobs retry
with exponential backoff. When a price reaches a user's target price the
favorite is flagged (and logged, which is where an email/push notification
plugs in). Search results nobody favorited are pruned after 30 days.

In development the worker runs inside `npm run dev`. In production it's a
separate process from the same image: `node apps/api/dist/worker.js`.

## Database

`apps/api/migrations/001_init.sql`:

- `products`: one row per real-world item (with UPC and Google cluster id)
- `listings`: that item at one store: latest price, stock, condition, URL
- `price_history`: append-only, written **only when price or stock changes**
  (plus a daily heartbeat), so it stays small. The chart carries each store's
  last price forward per day.
- `favorites`: user + product + optional target price (the primary key
  prevents duplicates)

Money is stored as integer cents everywhere.

## Security

- Sessions are an httpOnly, SameSite=Lax cookie (not readable by page
  scripts), 7-day expiry.
- Passwords hashed with bcrypt; emails are case-insensitive; login is rate
  limited; the same error for "no such user" and "wrong password".
- All secrets live in `.env` (gitignored). `npm run setup` generates the JWT secret.
- Helmet security headers and CSP; all API input is validated with zod.

## Deploying

The `Dockerfile` builds one image that serves the API, the React app and the
price worker from a single origin — so there's no CORS to configure and the
session cookie works normally. Run the whole production stack locally with:

```bash
docker compose --profile app up --build
```

### Live site (free tier)

`render.yaml` deploys the app and a Redis-compatible cache to
[Render](https://render.com); the database lives on
[Supabase](https://supabase.com), whose free tier doesn't expire the way
Render's free Postgres does.

1. **Database.** Create a Supabase project and copy the connection string
   (Project Settings → Database → Connection string → URI, "session" pooler).
2. **Deploy.** In Render: New → Blueprint → pick this repo. It reads
   `render.yaml` and creates the web service plus the cache.
3. **Secrets.** On the service's Environment tab, set `DATABASE_URL` to the
   Supabase URI and `RAPIDAPI_KEY` to your key. `JWT_SECRET` is generated for
   you; `REDIS_URL` is wired to the cache automatically.
4. **Deploy.** Migrations run on boot. The site is at
   `https://<service-name>.onrender.com`.
5. **Keep it warm.** Set the repository variable `SITE_URL` to that URL
   (Settings → Secrets and variables → Actions → Variables). The
   `keepalive` workflow then pings it every 6 hours, which stops Supabase
   pausing and lets the price worker run its sweep.

Pushing to `main` redeploys automatically, and `.github/workflows/ci.yml`
type-checks, tests and builds every push and pull request.

**Free-tier caveats.** The service sleeps after 15 minutes idle and takes about
a minute to wake. The cache is in-memory only, which is fine: cached searches
and queued jobs are both rebuilt automatically. A public site shares your
100 requests/month Google Shopping quota with every visitor — `render.yaml`
sets `SHOPPING_OFFERS_PREFETCH=0` to stretch it, and you can set
`DEMO_MODE=true` to show the UI without spending any quota at all.

### Anywhere else

Any host that runs a Docker image works. Set `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, `NODE_ENV=production`, `SERVE_WEB=true`, `MIGRATE_ON_START=true`,
`TRUST_PROXY=true` (if behind a proxy) and your source keys. For more than one
instance, drop `RUN_WORKER` and run `node apps/api/dist/worker.js` as its own
process so the refresh sweep doesn't run twice.
