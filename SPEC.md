# QVeris Earnings Copilot 技术规格说明

版本：0.2
日期：2026-07-16
状态：实现完成，待生产发布验证；线上仍是旧版本

本规格以当前实现为事实源。不要把本地 `dist/`、`.openai/hosting.json`、迁移文件或源码存在视为线上已部署、已绑定 D1 或已应用迁移的证明。

## 1. 产品边界

Earnings Copilot 是 `10_earnings_copilot` 下的独立 Next.js App Router 应用，用于生成带来源、缺口和置信度标注的财报研究页面与 API payload。

已实现页面：

- `/`
- `/earnings`
- `/earnings/calendar`
- `/earnings/briefs`
- `/earnings/[ticker]`
- `/earnings/[ticker]/share`
- `/developers/earnings`

Optional / out-of-scope：

- `/workflows/earnings-research` 仍是可选概念页，当前源码没有该路由，不属于本次已交付范围。

## 2. 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Server routes for API
- Drizzle schema and generated SQLite/D1 migration
- OpenNext Cloudflare build path for Sites packaging

## 3. Provider 与 Demo 规则

Provider 入口是 `lib/capabilities/provider.ts`。

- 默认 `EARNINGS_PROVIDER=qveris`，使用 `QVerisCapabilityProvider`。
- `EARNINGS_PROVIDER=hybrid` 时优先 QVeris；只有 `ALLOW_DEMO_DATA=true` 才允许 fallback 到 mock。
- `EARNINGS_PROVIDER=mock` 必须配合 `ALLOW_DEMO_DATA=true`，否则抛出 `MOCK_PROVIDER_NOT_ALLOWED`。
- 未知 provider 抛出 `INVALID_EARNINGS_PROVIDER`。
- 生产不应静默混入 mock。Mock 仅用于显式 demo、测试或离线开发。

## 4. 分析与响应合同

核心类型在 `lib/earnings/types.ts`。

`EarningsAnalysis` 当前包含：

- identity: `analysisId`, `ticker`, `language`, `mode`, `generatedAt`
- event data: `company`, `event`, `upcomingEvent`, `recentEvent`
- metrics/context: `estimates`, `results`, `quote`, `marketReaction`, `financials`, `segmentRevenue`, `historicalPattern`, `historicalSummary`, `news`, `filings`, `transcript`, `analystRevisions`
- interpretation: `beatMiss`, `oneLineVerdict`, `eventStatus`, `whatChanged`, `keyQuestions`, `keyDrivers`, `riskSignals`, `qualityOfEarnings`, `summaryBullets`, `watchNext`
- audit: `confidence`, `caveats`, `capabilityStatus`, `missing`, `issues`, `conflicts`, `sources`, `demo`

Resolved modes:

- `preview`
- `flash`
- `call_intelligence`
- `combined`
- `no_event`

The request can pass `mode: "auto"`; the returned `mode` is resolved.

## 5. Implemented API

### `POST /api/earnings/analyze`

Request fields:

```ts
{
  ticker: string;
  mode?: "auto" | "preview" | "flash" | "call_intelligence" | "combined" | "no_event";
  language?: "en" | "zh";
  includeSources?: boolean;
  includeHistoricalPattern?: boolean;
  includeNews?: boolean;
  includeFilings?: boolean;
  includeTranscript?: boolean;
  includeAiSummary?: boolean;
  maxNewsItems?: number;
}
```

Behavior:

- Checks request cache first.
- If no reusable cached analysis exists, runs `analyzeEarnings()` and then `saveAnalysis()`.
- Returns `Cache-Control: no-store`.
- Returns `X-QVeris-Analysis-Cache: HIT|MISS`.
- Provider capability errors return `502` with a controlled provider-unavailable payload.
- Invalid request/ticker returns `400`; unknown ticker returns `404`; unexpected errors return `500`.
- Production D1 persistence is fail-closed: if D1 is missing or analysis persistence fails, the request does not silently fall back to memory.

### `GET /api/earnings/analyze`

Thin wrapper around POST for browser/demo use. Query fields map to a POST body with `ticker`, `mode`, `language`, and `includeTranscript`.

### `GET /api/earnings/analysis/[analysisId]`

Reads stored analysis and returns the normal analyze response plus:

```json
{ "cache": { "hit": true, "source": "stored_analysis" } }
```

Missing id returns:

```json
{ "error": "ANALYSIS_NOT_FOUND" }
```

### `GET /api/earnings/history/[ticker]`

Current contract:

- Query: `limit`, default `8`, valid range `1..12`.
- Source: stored analyses from `research_snapshots` when D1 is available; non-production can fall back to process memory.
- Response:

```ts
{
  ticker: string;
  quarters: QuarterComparisonRow[];
  limitedHistory: boolean;
  generatedAt: string;
  cache: { hit: boolean; source: "stored_analysis" };
}
```

`limitedHistory: true` means fewer stored quarters than requested, not API success over a full multi-quarter dataset.

### `GET /api/earnings/calendar`

Query:

- `from`
- `to`
- `universe`
- `sector`
- `status`
- `timing`
- `minMarketCap`

Response includes events, sources, issues, `generatedAt`, `capabilityStatus`, and `confidence`. Invalid `minMarketCap` returns `400`.

### `POST /api/earnings/share-card`

Body accepts `analysisId` or `ticker`.

- Existing `analysisId` is authoritative. If it is supplied and not found, the route returns `404` rather than regenerating from ticker.
- If no analysis is supplied, route analyzes the ticker and saves the result.
- Response includes `shareUrl`, `imageUrl`, markdown, card payload, source/missing/capability/confidence metadata, and cache metadata.

### `GET /api/earnings/share-card/image`

Returns an SVG share image with `Cache-Control: no-store`. If `analysisId` is supplied and missing, returns `404`.

## 6. Persistence Contract

D1 schema has five tables:

- `qveris_fetch_cache`
- `earnings_events`
- `source_refs`
- `event_facts`
- `research_snapshots`

Analysis persistence:

- `saveAnalysis()` writes `earnings_events`, `source_refs`, `event_facts`, then `research_snapshots`.
- In production (`NODE_ENV=production`), D1 is required. Missing binding, read failure, write failure, or event fact revision conflict produces a `D1PersistenceError` and the request fails closed.
- Outside production, reads/writes can fall back to process memory.
- Process memory is not durable, not shared across instances, and lost on restart.

Research asset retention:

- `research_snapshots.cache_expires_at` controls request-cache reuse, not row deletion.
- `research_snapshots`, `earnings_events`, `source_refs`, and `event_facts` are long-term research assets in the current implementation.
- There is no automatic cleanup for those research asset tables yet.

Raw fetch cache:

- `qveris_fetch_cache` caches raw QVeris tool responses by hashed cache key.
- TTL varies by tool type.
- D1 failures in raw fetch cache are fail-open: cache read/write/retention errors are logged and the app continues without that cache.
- Oversized raw responses above 1.5 MB are not written to D1 and only use memory fallback.
- Retention only deletes raw cache rows where `expires_at < now - 90 days`.
- Raw cache fail-open does not change the production requirement that final analysis persistence must write to D1.

## 7. Sites Packaging And Release Verification

`npm run build:sites`:

- Builds a temporary shadow app through OpenNext Cloudflare.
- Removes local `.env*` files from OpenNext output paths.
- Prepares `dist/`.
- Runs the dist secret scan.
- Copies `.openai/hosting.json` and `drizzle/` into `dist/.openai/`.

This packaging can carry migration files, but it does not apply production migrations and does not verify production D1 binding. Production Sites runtime config is expected to use `EARNINGS_PROVIDER=qveris`, `EARNINGS_UNIVERSE=core`, and `ALLOW_DEMO_DATA=false`, but that does not mean this version has been released. After release, production must be checked with real runtime behavior before claiming deployment success.

Required post-release checks:

- `DB` binding exists in the runtime.
- Current migration has been applied and all five tables exist.
- Runtime secrets are configured outside source/artifacts.
- A real `POST /api/earnings/analyze` succeeds for a known ticker.
- `research_snapshots`, `earnings_events`, `source_refs`, and `event_facts` receive rows.
- Raw cache writes appear when cacheable QVeris calls occur and payloads are below the D1 size cap.
- `GET /api/earnings/history/[ticker]?limit=8` returns stored snapshot history or correctly reports limited history.

## 8. Compliance And Safety

- Research only; no investment advice.
- Do not emit buy/sell/hold recommendations.
- Do not invent missing financial numbers.
- Do not claim price targets or post-earnings stock predictions.
- Transcript-derived claims are withheld when transcript is unavailable.
- Numeric claims should resolve to sources or be marked unavailable.
- Missing capabilities, conflicts, and confidence rationale are visible in API payloads and UI.

## 9. Environment Variables

Required for real QVeris operation:

- `QVERIS_API_KEY`

Optional:

- `QVERIS_BASE_URL`
- `DEEPSEEK_API_KEY` (DeepSeek default, takes precedence)
- `OPENAI_API_KEY` (compatible fallback)
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `EARNINGS_PROVIDER`
- `EARNINGS_UNIVERSE`
- `ALLOW_DEMO_DATA`

Do not write secret values in docs, source, `dist/`, or chat.

## 10. Known Unverified Items

- Production Sites deployment has not been verified by this document update.
- Production D1 binding and migration application have not been verified by this document update.
- Runtime secret values and production behavior have not been verified by this document update, even though the target Sites config is expected to keep demo data disabled.
- Post-release cold-start behavior, D1 writes, raw cache writes, and history API behavior must be validated in the deployed runtime.
- `/workflows/earnings-research` is optional/out-of-scope and not implemented as a route.
