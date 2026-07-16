import type { AnalyzeEarningsRequest, EarningsAnalysis } from "@/lib/earnings/types";
import { buildAnalysisId, requestKey } from "@/lib/earnings/analysisId";
import {
  D1PersistenceError,
  getD1,
  isD1PersistenceError,
  isProductionRuntime,
  type D1DatabaseBinding,
  type D1PreparedStatement,
} from "@/lib/storage/d1";

const TTL_MS = 30 * 60_000;
const MAX_ITEMS = 200;
const SNAPSHOT_VERSION = 1;
const MAX_FACT_INSERT_ATTEMPTS = 3;
const MAX_SNAPSHOT_INSERT_ATTEMPTS = 20;

interface CacheEntry {
  key: string;
  analysis: EarningsAnalysis;
}

interface RequestEntry {
  analysisId: string;
  expiresAt: number;
}

interface SnapshotRow {
  analysis_json: unknown;
  request_key: string;
  cache_expires_at: string;
}

interface FactRow {
  value_number: number | null;
  value_text: string | null;
  unit: string | null;
  currency: string | null;
  source_ref_id: string | null;
  raw_fetch_id: string | null;
  fact_version: number;
}

interface RawFetchRow {
  cache_key: string;
}

interface StoredSourceRef {
  sourceRefId: string;
  rawFetchId: string | null;
}

interface MemoryStore {
  byId: Map<string, CacheEntry>;
  byRequest: Map<string, RequestEntry>;
}

const MEMORY_STORE_KEY = Symbol.for("qveris.earnings.analysisStore.memory.v1");
const memoryStore = ((globalThis as typeof globalThis & Partial<Record<symbol, MemoryStore>>)[MEMORY_STORE_KEY] ??= {
  byId: new Map<string, CacheEntry>(),
  byRequest: new Map<string, RequestEntry>(),
});
const { byId, byRequest } = memoryStore;

export async function saveAnalysis(request: AnalyzeEarningsRequest, analysis: EarningsAnalysis) {
  const key = requestKey(request);
  const now = Date.now();
  const cacheExpiresAt = hasRetryableIssue(analysis) ? now - 1 : now + TTL_MS;

  const db = getD1();
  if (!db) {
    remember(key, analysis, cacheExpiresAt);
    return;
  }

  try {
    await saveResearchAssets(db, analysis);
    await saveSnapshotWithRetries(db, key, analysis, cacheExpiresAt);
    if (!isProductionRuntime()) remember(key, analysis, cacheExpiresAt);
  } catch (error) {
    if (isProductionRuntime()) {
      throw isD1PersistenceError(error)
        ? error
        : new D1PersistenceError("D1 analysis persistence failed", "D1_WRITE_FAILED", error);
    }
    remember(key, analysis, cacheExpiresAt);
    console.error("D1 analysis persistence failed", {
      analysisId: analysis.analysisId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return;
  }
}

export async function getAnalysisById(analysisId: string) {
  evictExpiredRequests();
  const db = getD1();
  if (db) {
    try {
      const row = await db.prepare(
        "SELECT analysis_json, request_key, cache_expires_at FROM research_snapshots WHERE analysis_id = ? LIMIT 1",
      ).bind(analysisId).first<SnapshotRow>();
      const analysis = rowToAnalysis(row);
      if (analysis && row) remember(row.request_key, analysis, parseCacheExpiresAt(row.cache_expires_at));
      if (analysis) return analysis;
    } catch (error) {
      if (isProductionRuntime()) {
        throw isD1PersistenceError(error)
          ? error
          : new D1PersistenceError("D1 analysis read failed", "D1_READ_FAILED", error);
      }
      // fall through to memory
    }
  }
  if (isProductionRuntime()) return null;
  return byId.get(analysisId)?.analysis ?? null;
}

export async function getCachedAnalysis(request: AnalyzeEarningsRequest) {
  evictExpiredRequests();
  const key = requestKey(request);
  if (!isProductionRuntime()) {
    const cached = byRequest.get(key);
    if (cached) {
      const analysis = byId.get(cached.analysisId)?.analysis;
      if (analysis) return analysis;
      byRequest.delete(key);
    }
  }

  const nowIso = new Date().toISOString();
  const db = getD1();
  if (db) {
    try {
      const row = await db.prepare(
        `SELECT analysis_json, request_key, cache_expires_at
         FROM research_snapshots
         WHERE request_key = ? AND cache_expires_at > ?
         ORDER BY generated_at DESC
         LIMIT 1`,
      ).bind(key, nowIso).first<SnapshotRow>();
      const analysis = rowToAnalysis(row);
      if (analysis && row) remember(key, analysis, parseCacheExpiresAt(row.cache_expires_at));
      if (analysis) return analysis;
    } catch (error) {
      if (isProductionRuntime()) {
        throw isD1PersistenceError(error)
          ? error
          : new D1PersistenceError("D1 analysis read failed", "D1_READ_FAILED", error);
      }
      // fall through to memory
    }
  }

  return null;
}

export async function listAnalysesByTicker(ticker: string, limit = 10) {
  evictExpiredRequests();
  const normalized = normalizeTicker(ticker);
  const capped = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const db = getD1();
  if (db) {
    try {
      const { results = [] } = await db.prepare(
        `SELECT analysis_json, request_key, cache_expires_at
         FROM research_snapshots
         WHERE ticker = ?
         ORDER BY generated_at DESC
         LIMIT ?`,
      ).bind(normalized, capped).all<SnapshotRow>();
      return results.map(rowToAnalysis).filter((analysis): analysis is EarningsAnalysis => !!analysis);
    } catch (error) {
      if (isProductionRuntime()) {
        throw isD1PersistenceError(error)
          ? error
          : new D1PersistenceError("D1 analysis read failed", "D1_READ_FAILED", error);
      }
      // fall through to memory
    }
  }

  if (isProductionRuntime()) return [];
  return [...byId.values()]
    .map((entry) => entry.analysis)
    .filter((analysis) => normalizeTicker(analysis.ticker) === normalized)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, capped);
}

export function __clearAnalysisStoreForTests() {
  byId.clear();
  byRequest.clear();
}

function remember(key: string, analysis: EarningsAnalysis, cacheExpiresAt: number) {
  byId.set(analysis.analysisId, { key, analysis });
  if (cacheExpiresAt <= Date.now()) {
    byRequest.delete(key);
  } else {
    byRequest.set(key, { analysisId: analysis.analysisId, expiresAt: cacheExpiresAt });
  }
  evictOverflow();
}

function hasRetryableIssue(analysis: EarningsAnalysis) {
  return analysis.issues?.some((issue) => issue.retryable) ?? false;
}

function evictExpiredRequests() {
  const now = Date.now();
  for (const [key, entry] of byRequest.entries()) {
    if (entry.expiresAt > now) continue;
    byRequest.delete(key);
  }
}

function evictOverflow() {
  while (byId.size > MAX_ITEMS) {
    const first = byId.keys().next().value as string | undefined;
    if (!first) return;
    const entry = byId.get(first);
    byId.delete(first);
    if (entry && byRequest.get(entry.key)?.analysisId === first) byRequest.delete(entry.key);
  }
}

async function saveSnapshotWithRetries(db: D1DatabaseBinding, key: string, analysis: EarningsAnalysis, cacheExpiresAt: number) {
  const attempted = new Set<string>();
  for (let attempt = 0; attempt < MAX_SNAPSHOT_INSERT_ATTEMPTS; attempt += 1) {
    attempted.add(analysis.analysisId);
    try {
      await saveSnapshot(db, key, analysis, cacheExpiresAt);
      return;
    } catch (error) {
      if (!isSnapshotIdConflict(error) || attempt === MAX_SNAPSHOT_INSERT_ATTEMPTS - 1) throw error;
      let nextId = analysis.analysisId;
      while (attempted.has(nextId)) {
        nextId = buildAnalysisId({
          ticker: analysis.ticker,
          mode: analysis.mode,
          generatedAt: analysis.generatedAt,
        });
      }
      analysis.analysisId = nextId;
    }
  }
}

async function saveSnapshot(db: D1DatabaseBinding, key: string, analysis: EarningsAnalysis, cacheExpiresAt: number) {
  const now = new Date().toISOString();
  const analysisJson = JSON.stringify(analysis);
  await runWrite(db.prepare(
    `INSERT INTO research_snapshots (
       analysis_id, request_key, ticker, event_id, mode, language, snapshot_version,
       analysis_json, generated_at, cache_expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(analysis_id) DO NOTHING`,
  ).bind(
    analysis.analysisId,
    key,
    normalizeTicker(analysis.ticker),
    currentEventDbId(analysis),
    analysis.mode,
    analysis.language,
    SNAPSHOT_VERSION,
    analysisJson,
    analysis.generatedAt,
    new Date(cacheExpiresAt).toISOString(),
    now,
    now,
  ));
  const stored = await db.prepare(
    "SELECT analysis_json, request_key, cache_expires_at FROM research_snapshots WHERE analysis_id = ? LIMIT 1",
  ).bind(analysis.analysisId).first<SnapshotRow>();
  if (!stored || String(stored.analysis_json) !== analysisJson) {
    throw new D1PersistenceError(`D1 snapshot analysis_id conflict: ${analysis.analysisId}`, "D1_SNAPSHOT_ID_CONFLICT");
  }
}

function isSnapshotIdConflict(error: unknown) {
  return error instanceof D1PersistenceError && error.code === "D1_SNAPSHOT_ID_CONFLICT";
}

async function saveResearchAssets(db: D1DatabaseBinding, analysis: EarningsAnalysis) {
  const now = new Date().toISOString();
  const event = analysis.event ?? analysis.upcomingEvent ?? analysis.recentEvent;
  if (event) {
    const identity = eventIdentity(event);
    await runWrite(db.prepare(
      `INSERT INTO earnings_events (
         event_id, canonical_key, ticker, fiscal_year, fiscal_period, report_date,
         timing, status, event_version, data_as_of, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
         canonical_key = excluded.canonical_key,
         ticker = excluded.ticker,
         fiscal_year = excluded.fiscal_year,
         fiscal_period = excluded.fiscal_period,
         report_date = excluded.report_date,
         timing = excluded.timing,
         status = excluded.status,
         event_version = excluded.event_version,
         data_as_of = excluded.data_as_of,
         last_seen_at = excluded.last_seen_at`,
    ).bind(
      identity.eventId,
      identity.canonicalKey,
      normalizeTicker(event.ticker),
      event.fiscalYear ?? null,
      event.fiscalPeriod ?? null,
      event.reportDate,
      event.timing,
      event.status,
      identity.version,
      analysis.generatedAt,
      now,
      now,
    ));
  }

  const sourceRefs = new Map<string, StoredSourceRef>();
  for (const source of analysis.sources) {
    const sourceRef = {
      sourceRefId: sourceStorageId(source),
      rawFetchId: await latestRawFetchId(db, source.executionId),
    };
    sourceRefs.set(source.id, sourceRef);
    await runWrite(db.prepare(
      `INSERT INTO source_refs (
         source_ref_id, provider, capability, execution_id, raw_fetch_id,
         title, url, published_at, retrieved_at, source_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_ref_id) DO NOTHING`,
    ).bind(
      sourceRef.sourceRefId,
      source.provider ?? "unknown",
      source.capability ?? null,
      source.executionId ?? null,
      sourceRef.rawFetchId,
      source.title,
      source.url ?? null,
      source.publishedAt ?? null,
      source.retrievedAt,
      sourceRef.sourceRefId,
    ));
  }

  if (event) await saveEventFacts(db, analysis, event, sourceRefs);
}

async function saveEventFacts(
  db: D1DatabaseBinding,
  analysis: EarningsAnalysis,
  event: NonNullable<EarningsAnalysis["event"]>,
  sourceRefs: Map<string, StoredSourceRef>,
) {
  const eventDbId = eventIdentity(event).eventId;
  const periodKey = event.fiscalYear !== undefined && event.fiscalPeriod
    ? `${event.fiscalYear}:${event.fiscalPeriod}`
    : event.reportDate;
  const currency = analysis.company?.currency ?? null;
  const facts = [
    numberFact(
      "revenue_actual",
      "actual",
      analysis.results?.revenueActual ?? event.revenueActual,
      "currency",
      currency,
      factSourceRef(sourceRefs, analysis.results?.fieldSourceIds?.revenueActual, analysis.results?.sourceIds ?? event.sourceIds),
    ),
    numberFact(
      "revenue_estimate",
      "estimate",
      analysis.estimates?.revenueEstimate ?? event.revenueEstimate,
      "currency",
      currency,
      factSourceRef(sourceRefs, analysis.estimates?.fieldSourceIds?.revenueEstimate, analysis.estimates?.sourceIds ?? event.sourceIds),
    ),
    numberFact(
      "eps_actual",
      "actual",
      analysis.results?.epsActual ?? event.epsActual,
      "currency_per_share",
      currency,
      factSourceRef(sourceRefs, analysis.results?.fieldSourceIds?.epsActual, analysis.results?.sourceIds ?? event.sourceIds),
    ),
    numberFact(
      "eps_estimate",
      "estimate",
      analysis.estimates?.epsEstimate ?? event.epsEstimate,
      "currency_per_share",
      currency,
      factSourceRef(sourceRefs, analysis.estimates?.fieldSourceIds?.epsEstimate, analysis.estimates?.sourceIds ?? event.sourceIds),
    ),
    numberFact(
      "gross_margin",
      "quality",
      analysis.results?.grossMargin,
      "ratio",
      null,
      factSourceRef(sourceRefs, analysis.results?.fieldSourceIds?.grossMargin, analysis.results?.sourceIds),
    ),
    numberFact(
      "operating_margin",
      "quality",
      analysis.results?.operatingMargin,
      "ratio",
      null,
      factSourceRef(sourceRefs, analysis.results?.fieldSourceIds?.operatingMargin, analysis.results?.sourceIds),
    ),
    numberFact(
      "net_income",
      "quality",
      analysis.results?.netIncome,
      "currency",
      currency,
      factSourceRef(sourceRefs, analysis.results?.fieldSourceIds?.netIncome, analysis.results?.sourceIds),
    ),
    textFact(
      "guidance_text",
      "guidance",
      analysis.results?.guidanceText,
      factSourceRef(sourceRefs, analysis.results?.fieldSourceIds?.guidanceText, analysis.results?.sourceIds),
    ),
    numberFact(
      "market_close_change_pct",
      "market",
      analysis.marketReaction?.closeChangePct,
      "percent",
      null,
      factSourceRef(sourceRefs, undefined, analysis.marketReaction?.sourceIds),
    ),
  ].filter((fact): fact is EventFact => fact !== null);

  for (const fact of facts) {
    await saveEventFact(db, analysis, eventDbId, periodKey, fact);
  }
}

async function saveEventFact(
  db: D1DatabaseBinding,
  analysis: EarningsAnalysis,
  eventDbId: string,
  periodKey: string,
  fact: EventFact,
) {
  for (let attempt = 0; attempt < MAX_FACT_INSERT_ATTEMPTS; attempt += 1) {
    const latest = await latestStoredFact(db, eventDbId, fact, periodKey);
    if (latest && sameFact(latest, fact)) return;
    const factVersion = latest ? latest.fact_version + 1 : 1;
    const factId = `${eventDbId}:${fact.metric}:v${factVersion}`;
    await runWrite(db.prepare(
      `INSERT INTO event_facts (
         fact_id, event_id, fact_type, metric, period_key, value_number, value_text,
         unit, currency, source_ref_id, raw_fetch_id, fact_version, as_of
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(fact_id) DO NOTHING`,
    ).bind(
      factId,
      eventDbId,
      fact.type,
      fact.metric,
      periodKey,
      fact.valueNumber,
      fact.valueText,
      fact.unit,
      fact.currency,
      fact.sourceRefId,
      fact.rawFetchId,
      factVersion,
      analysis.generatedAt,
    ));
    const stored = await storedFactById(db, factId);
    if (stored && sameFact(stored, fact)) return;
  }
  throw new D1PersistenceError(`D1 event fact revision conflict: ${eventDbId}:${fact.metric}`, "D1_EVENT_FACT_CONFLICT");
}

async function runWrite(statement: D1PreparedStatement) {
  const result = await statement.run();
  if (isFailedD1Result(result)) throw new Error("D1 write failed");
}

function isFailedD1Result(result: unknown) {
  return !!result
    && typeof result === "object"
    && "success" in result
    && (result as { success?: unknown }).success === false;
}

interface EventFact {
  metric: string;
  type: "actual" | "estimate" | "quality" | "guidance" | "market";
  valueNumber: number | null;
  valueText: string | null;
  unit: string | null;
  currency: string | null;
  sourceRefId: string | null;
  rawFetchId: string | null;
}

async function latestStoredFact(db: D1DatabaseBinding, eventId: string, fact: EventFact, periodKey: string) {
  return db.prepare(
    `SELECT value_number, value_text, unit, currency, source_ref_id, raw_fetch_id, fact_version
     FROM event_facts
     WHERE event_id = ? AND fact_type = ? AND metric = ? AND period_key = ?
     ORDER BY fact_version DESC
     LIMIT 1`,
  ).bind(eventId, fact.type, fact.metric, periodKey).first<FactRow>();
}

async function storedFactById(db: D1DatabaseBinding, factId: string) {
  return db.prepare(
    `SELECT value_number, value_text, unit, currency, source_ref_id, raw_fetch_id, fact_version
     FROM event_facts
     WHERE fact_id = ?
     LIMIT 1`,
  ).bind(factId).first<FactRow>();
}

function sameFact(row: FactRow, fact: EventFact) {
  return row.value_number === fact.valueNumber
    && row.value_text === fact.valueText
    && row.unit === fact.unit
    && row.currency === fact.currency
    && row.source_ref_id === fact.sourceRefId
    && row.raw_fetch_id === fact.rawFetchId;
}

function numberFact(
  metric: string,
  type: EventFact["type"],
  value: number | undefined,
  unit: string,
  currency: string | null,
  sourceRef: StoredSourceRef | null,
): EventFact | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return {
    metric,
    type,
    valueNumber: value,
    valueText: null,
    unit,
    currency,
    sourceRefId: sourceRef?.sourceRefId ?? null,
    rawFetchId: sourceRef?.rawFetchId ?? null,
  };
}

function textFact(
  metric: string,
  type: EventFact["type"],
  value: string | undefined,
  sourceRef: StoredSourceRef | null,
): EventFact | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return {
    metric,
    type,
    valueNumber: null,
    valueText: normalized,
    unit: null,
    currency: null,
    sourceRefId: sourceRef?.sourceRefId ?? null,
    rawFetchId: sourceRef?.rawFetchId ?? null,
  };
}

function factSourceRef(sourceRefs: Map<string, StoredSourceRef>, fieldIds?: string[], objectIds?: string[]) {
  const sourceId = fieldIds?.[0] ?? objectIds?.[0];
  return sourceId ? sourceRefs.get(sourceId) ?? null : null;
}

async function latestRawFetchId(db: D1DatabaseBinding, executionId: string | undefined) {
  if (!executionId) return null;
  const row = await db.prepare(
    `SELECT cache_key
     FROM qveris_fetch_cache
     WHERE execution_id = ?
     ORDER BY fetched_at DESC
     LIMIT 1`,
  ).bind(executionId).first<RawFetchRow>();
  return row?.cache_key ?? null;
}

function sourceStorageId(source: EarningsAnalysis["sources"][number]) {
  return `${source.id}:${source.executionId ?? source.retrievedAt}`;
}

function eventCanonicalKey(event: NonNullable<EarningsAnalysis["event"]>) {
  const ticker = normalizeTicker(event.ticker);
  if (event.fiscalYear !== undefined && event.fiscalPeriod) {
    return `${ticker}:${event.fiscalYear}:${event.fiscalPeriod}`;
  }
  return `${ticker}:${event.reportDate}:${event.timing}`;
}

function eventVersion(reportDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(reportDate);
  if (!match) throw new Error(`Invalid reportDate: ${reportDate}`);
  return Number(`${match[1]}${match[2]}${match[3]}`);
}

function eventIdentity(event: NonNullable<EarningsAnalysis["event"]>) {
  const canonicalKey = eventCanonicalKey(event);
  const version = eventVersion(event.reportDate);
  return {
    canonicalKey,
    version,
    eventId: `${canonicalKey}:${version}`,
  };
}

function rowToAnalysis(row: SnapshotRow | null | undefined) {
  if (!row) return null;
  try {
    return JSON.parse(String(row.analysis_json)) as EarningsAnalysis;
  } catch {
    return null;
  }
}

function currentEventDbId(analysis: EarningsAnalysis) {
  const event = analysis.event ?? analysis.upcomingEvent ?? analysis.recentEvent;
  return event ? eventIdentity(event).eventId : null;
}

function parseCacheExpiresAt(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/^\$/, "");
}
