import { getD1, type D1DatabaseBinding } from "@/lib/storage/d1";

const SCHEMA_VERSION = 1;
const MAX_D1_RESPONSE_BYTES = 1_500_000;
const MAX_MEMORY_ITEMS = 500;
const DEFAULT_TTL_MS = 15 * 60_000;
const DEFAULT_NAMESPACE = `qveris-fetch-cache:v${SCHEMA_VERSION}`;
const RETENTION_INTERVAL_MS = 60 * 60_000;
const RETENTION_CUTOFF_MS = 90 * 24 * 60 * 60_000;

interface CacheValue {
  data: unknown;
  executionId?: string;
}

interface MemoryEntry extends CacheValue {
  expiresAt: number;
}

interface CacheRow {
  response_json: string;
  execution_id: string | null;
  expires_at: string;
  schema_version: number;
}

const MEMORY_CACHE_KEY = Symbol.for("qveris.capabilities.fetchCache.memory.v1");
const memoryCache = ((globalThis as typeof globalThis & Partial<Record<symbol, Map<string, MemoryEntry>>>)[MEMORY_CACHE_KEY] ??=
  new Map<string, MemoryEntry>());
const RETENTION_STATE_KEY = Symbol.for("qveris.capabilities.fetchCache.retention.v1");
const retentionState = ((globalThis as typeof globalThis & Partial<Record<symbol, { lastRunAt: number }>>)[RETENTION_STATE_KEY] ??= { lastRunAt: 0 });

export async function readQVerisFetchCache(
  toolId: string,
  parameters: Record<string, unknown>,
  namespace = DEFAULT_NAMESPACE,
  now = new Date(),
): Promise<CacheValue | null> {
  const cacheKey = await qverisFetchCacheKey(toolId, parameters, namespace);
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now.getTime()) {
    return { data: cached.data, executionId: cached.executionId };
  }
  memoryCache.delete(cacheKey);

  const db = getD1();
  if (db) {
    await runRetention(db, now);
    try {
      const row = await db.prepare(
        `SELECT response_json, execution_id, expires_at, schema_version
         FROM qveris_fetch_cache
         WHERE cache_key = ? AND schema_version = ? AND expires_at > ?
         LIMIT 1`,
      ).bind(cacheKey, SCHEMA_VERSION, now.toISOString()).first<CacheRow>();
      if (row) {
        const value = { data: JSON.parse(row.response_json) as unknown, executionId: row.execution_id ?? undefined };
        remember(cacheKey, value, Date.parse(row.expires_at), now.getTime());
        return value;
      }
    } catch {
      console.error("QVeris cache read failed", toolId);
    }
  }
  return null;
}

export async function writeQVerisFetchCache(
  toolId: string,
  parameters: Record<string, unknown>,
  value: CacheValue,
  namespace = DEFAULT_NAMESPACE,
  now = new Date(),
) {
  const cacheKey = await qverisFetchCacheKey(toolId, parameters, namespace);
  const ttlMs = qverisFetchTtlMs(toolId);
  const expiresAt = new Date(now.getTime() + ttlMs);
  let responseJson: string;
  try {
    responseJson = JSON.stringify(value.data);
  } catch {
    return;
  }
  if (typeof responseJson !== "string") return;
  remember(cacheKey, value, expiresAt.getTime(), now.getTime());

  const db = getD1();
  if (db) await runRetention(db, now);
  // ponytail: D1 row cap; move oversized raw payloads to R2 only after this limit is a real product need.
  if (!db || new TextEncoder().encode(responseJson).length > MAX_D1_RESPONSE_BYTES) return;

  try {
    const fetchedAtIso = now.toISOString();
    await db.prepare(
      `INSERT INTO qveris_fetch_cache (
         cache_key, tool_id, parameters_json, response_json, response_hash,
         execution_id, fetched_at, expires_at, schema_version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         tool_id = excluded.tool_id,
         parameters_json = excluded.parameters_json,
         response_json = excluded.response_json,
         response_hash = excluded.response_hash,
         execution_id = excluded.execution_id,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at,
         schema_version = excluded.schema_version`,
    ).bind(
      cacheKey,
      toolId,
      canonicalJson(parameters),
      responseJson,
      await sha256Hex(responseJson),
      value.executionId ?? null,
      fetchedAtIso,
      expiresAt.toISOString(),
      SCHEMA_VERSION,
    ).run();
  } catch {
    console.error("QVeris cache write failed", toolId);
  }
}

export async function qverisFetchCacheKey(toolId: string, parameters: Record<string, unknown>, namespace = DEFAULT_NAMESPACE) {
  return sha256Hex(canonicalJson({ namespace, toolId, parameters }));
}

export function qverisFetchTtlMs(toolId: string) {
  const id = toolId.toLowerCase();
  if (id.includes("quote")) return 60_000;
  if (id.includes("calendar") || id.includes("estimates")) return 30 * 60_000;
  if (id.includes("news")) return 15 * 60_000;
  if (id.includes("filing")) return 60 * 60_000;
  if (id.includes("profile")) return 7 * 24 * 60 * 60_000;
  if (id.includes("transcript")) return 30 * 24 * 60 * 60_000;
  if (
    id.includes("earnings.retrieve")
    || id.includes("incomestatement")
    || id.includes("balancesheet")
    || id.includes("cashflow")
    || id.includes("revenueproductsegmentation")
  ) return 24 * 60 * 60_000;
  return DEFAULT_TTL_MS;
}

export function __clearQVerisFetchCacheForTests() {
  memoryCache.clear();
  retentionState.lastRunAt = 0;
}

async function runRetention(db: D1DatabaseBinding, now: Date) {
  const nowMs = now.getTime();
  if (nowMs - retentionState.lastRunAt < RETENTION_INTERVAL_MS) return;
  retentionState.lastRunAt = nowMs;
  try {
    await db.prepare(
      `DELETE FROM qveris_fetch_cache
       WHERE expires_at < ?
         AND NOT EXISTS (SELECT 1 FROM source_refs WHERE source_refs.raw_fetch_id = qveris_fetch_cache.cache_key)
         AND NOT EXISTS (SELECT 1 FROM event_facts WHERE event_facts.raw_fetch_id = qveris_fetch_cache.cache_key)`,
    ).bind(new Date(nowMs - RETENTION_CUTOFF_MS).toISOString()).run();
  } catch {
    console.error("QVeris cache retention failed");
  }
}

function remember(cacheKey: string, value: CacheValue, expiresAt: number, now: number) {
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }
  if (!memoryCache.has(cacheKey) && memoryCache.size >= MAX_MEMORY_ITEMS) {
    const oldestKey = memoryCache.keys().next().value as string | undefined;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(cacheKey, { ...value, expiresAt });
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortForJson(item)]),
  );
}

async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
