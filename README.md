# QVeris Earnings Copilot

Standalone Next.js app for source-cited earnings research. The app analyzes a ticker with QVeris capabilities, records source/missing/confidence metadata, and renders console, ticker, calendar, briefs, share, and developer surfaces.

Current status: implementation complete, pending production release verification. Production Sites runtime config is prepared with `EARNINGS_PROVIDER=qveris`, `EARNINGS_UNIVERSE=core`, and `ALLOW_DEMO_DATA=false`, but the live app is still the old version until a release is verified. This repository state does not prove the current app is deployed or that D1 migrations have been applied online.

## What Is Implemented

- Pages: `/`, `/earnings`, `/earnings/calendar`, `/earnings/briefs`, `/earnings/[ticker]`, `/earnings/[ticker]/share`, `/developers/earnings`.
- APIs: `POST|GET /api/earnings/analyze`, `GET /api/earnings/calendar`, `GET /api/earnings/analysis/[analysisId]`, `GET /api/earnings/history/[ticker]`, `POST /api/earnings/share-card`, `GET /api/earnings/share-card/image`.
- Providers: QVeris default, hybrid optional, mock only when explicitly enabled for demo/testing.
- Persistence: Cloudflare production uses D1 binding `DB`; single-node Docker production uses a local SQLite file. Both are fail-closed in production. Local non-production can fall back to process memory.
- Sites packaging: `npm run build:sites` includes `.openai/hosting.json` and `drizzle/` under `dist/.openai/`; it does not prove the production D1 binding exists or that migrations were applied.

## Setup

```bash
npm install
```

Create local environment variables outside source control. Do not put secret values in docs, committed files, `dist/`, or chat.

Required for real QVeris analysis:

- `QVERIS_API_KEY`

Optional runtime variables:

- `QVERIS_BASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `EARNINGS_PROVIDER` (`qveris`, `hybrid`, or `mock`; default is `qveris`)
- `EARNINGS_UNIVERSE` (`core` by default for calendar requests)
- `ALLOW_DEMO_DATA` (`true` only for explicit demo/testing)

Mock demo mode requires both:

```bash
EARNINGS_PROVIDER=mock
ALLOW_DEMO_DATA=true
```

## Local Development

```bash
npm run dev
```

Then open `http://localhost:3000`.

Useful local checks:

```bash
npm test
npm run typecheck
npm run build
```

For a secret-safe Sites build artifact:

```bash
npm run build:sites
npm run scan:dist-secrets
```

`build:sites` builds through OpenNext Cloudflare in a temporary shadow app, removes local `.env*` leakage from the artifact path, prepares `dist/`, and scans local secret values visible in `.env*`. The scan does not cover Git history, remote runtime secrets, Sites config, or logs.

## Single-Node Docker Deployment

Docker deployment uses the Node.js 24 Next.js standalone server and a local
SQLite database. It does not require or connect to Cloudflare. The database and
migrations use the same SQL schema as D1, and the SQLite file is persisted in a
Docker volume.

Create the runtime environment file outside source control:

```bash
cp deploy/.env.example deploy/.env
```

Set at least `QVERIS_API_KEY`, then build and start the service:

```bash
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
```

The application is available at `http://localhost:3000` by default. Change
`APP_PORT` in `deploy/.env` to publish a different host port.

To run an image published by the GitHub workflow instead of building locally:

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d --no-build
```

The `earnings_sqlite_data` volume contains `/data/earnings.db` and its SQLite WAL
files. Back up that volume before destructive Docker maintenance. Removing the
volume deletes stored analyses and migration state.

This Compose topology is intentionally single-node. Do not run multiple app
replicas against the same SQLite volume. Move persistence to a network database
before horizontal scaling.

## Local Cloudflare D1 Preview

The original Cloudflare D1 implementation remains the default when
`PERSISTENCE_DRIVER` is unset. Build and preview the OpenNext worker with a local
D1 binding using:

```bash
npm run preview:worker
```

The preview command applies pending local D1 migrations before starting Wrangler.
Wrangler stores this local preview state separately from the Docker SQLite file.

## Local D1 Migration Check

The schema lives in `db/schema.ts`; the generated migration is `drizzle/0000_lethal_grandmaster.sql`.

Validate Drizzle metadata:

```bash
npx drizzle-kit check
```

Apply the migration to a temporary SQLite database with the system `sqlite3` and verify the five tables plus declared foreign keys:

```bash
tmp="$(mktemp -t earnings-d1.XXXXXX.db)"
sqlite3 "$tmp" < drizzle/0000_lethal_grandmaster.sql
sqlite3 "$tmp" "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('earnings_events','event_facts','qveris_fetch_cache','research_snapshots','source_refs') ORDER BY name;"
sqlite3 "$tmp" "SELECT 'foreign_keys=' || ((SELECT count(*) FROM pragma_foreign_key_list('event_facts')) + (SELECT count(*) FROM pragma_foreign_key_list('research_snapshots')) + (SELECT count(*) FROM pragma_foreign_key_list('source_refs')));"
rm -f "$tmp"
```

Expected output includes the five tables and `foreign_keys=5`:

- `earnings_events`
- `event_facts`
- `qveris_fetch_cache`
- `research_snapshots`
- `source_refs`

This is a local validation only. It does not apply or verify production migrations.

## API Contracts

`POST /api/earnings/analyze`

- Body: `ticker`, optional `mode`, `language`, `includeSources`, `includeHistoricalPattern`, `includeNews`, `includeFilings`, `includeTranscript`, `includeAiSummary`, `maxNewsItems`.
- Response: structured `AnalyzeEarningsResponse` with `analysisId`, `analysis`, `data`, `capabilityStatus`, `missing`, `issues`, `conflicts`, `sources`, and `cache`.
- If provider calls partially fail but at least one evidence source is usable, the route still returns structured partial data with `capabilityStatus`, `missing`, and `issues`.
- If all provider evidence is unavailable, the route fails closed with `502 { "error": "EARNINGS_DATA_UNAVAILABLE" }`.
- `getEarningsEstimates` resolves estimates by the full event fiscal identity (`fiscalYear` + `fiscalPeriod`) when an event is known; it does not guess the quarter from the nearest date.
- Headers: `Cache-Control: no-store`, `X-QVeris-Analysis-Cache: HIT|MISS`.

`GET /api/earnings/history/[ticker]?limit=N`

- `limit` defaults to `8`; valid range is `1..12`.
- Source is stored analyses for the ticker.
- Response includes `ticker`, `quarters`, `limitedHistory`, `generatedAt`, `cache: { hit, source: "stored_analysis" }`, `sources`, `missing`, `capabilityStatus`, and `confidence`.
- `sources` contains source refs actually used by returned quarter rows. Missing referenced source refs are reported as `missing` entries like `source:<id>`.
- `missing` includes `historicalSnapshots:insufficient` when fewer stored quarters exist than requested.
- `capabilityStatus` reports `historicalSnapshots` as `available`, `partial`, or `unavailable`, and `sourceRefs` as `available`, `partial`, or `unavailable`.
- `confidence` is `{ label: "high" | "medium" | "low", reason }`, with low confidence for no stored history or missing source refs, medium for partial history, and high only when stored history and source refs cover the requested limit.
- Empty or short history means there are not enough stored snapshots yet.

`GET /api/earnings/analysis/[analysisId]`

- Reads stored analysis by id.
- Returns `404 { "error": "ANALYSIS_NOT_FOUND" }` when missing.

`GET /api/earnings/calendar`

- Query: `from`, `to`, `universe`, `sector`, `status`, `timing`, `minMarketCap`.
- Returns events plus source/confidence/capability metadata with `Cache-Control: no-store`.

`POST /api/earnings/share-card`

- Body: `analysisId` or `ticker`.
- Existing `analysisId` must resolve; missing stored analysis returns 404 instead of silently regenerating.

## Persistence Rules

- Cloudflare production requires D1 binding `DB`; Docker production requires `PERSISTENCE_DRIVER=sqlite` and a writable `SQLITE_DATABASE_PATH`. Missing or failing persistence causes controlled errors instead of silently degrading to memory.
- Non-production can use in-process memory fallback for analysis storage. That memory is not shared across instances and is lost on restart.
- Raw QVeris fetch cache is best-effort: D1 read/write/retention failures are logged and the request can continue without the cache.
- `source_refs` are immutable per source execution version (`source.id` + `executionId` or retrieval time). When an `executionId` has a matching `qveris_fetch_cache` row, `raw_fetch_id` links to that raw row; otherwise it is `null`.
- `event_facts.raw_fetch_id` follows the selected source ref's raw fetch link, so facts can trace back to the existing raw row when one exists and remain `null` when it does not.
- Research assets (`research_snapshots`, `earnings_events`, `source_refs`, `event_facts`) are long-lived. Raw fetch rows referenced by `source_refs.raw_fetch_id` or `event_facts.raw_fetch_id` are retained for lineage; only unreferenced raw cache rows are deleted after they have been expired for more than 90 days.

## Deployment Pre-Check

Before claiming production readiness:

1. Run `npm test`, `npm run typecheck`, and `npm run build:sites`.
2. Confirm `npm run scan:dist-secrets` passes.
3. Confirm `dist/.openai/hosting.json` exists and declares D1 binding `DB`.
4. Confirm `dist/.openai/drizzle/0000_lethal_grandmaster.sql` is present.
5. Confirm runtime config/secrets are present in the deployment environment, not in source or artifacts, with demo data disabled for production.
6. Confirm production D1 has the five expected tables after the migration process used by the deployment environment.
7. After deployment, make a real `POST /api/earnings/analyze` request and verify D1 rows appear in `research_snapshots`, `earnings_events`, `source_refs`, and `event_facts`.
8. Verify `GET /api/earnings/history/[ticker]?limit=8` reflects stored snapshots and reports limited history honestly when data is sparse.

Do not claim the current app is deployed, migrated, or bound to production D1 until those runtime checks pass.
