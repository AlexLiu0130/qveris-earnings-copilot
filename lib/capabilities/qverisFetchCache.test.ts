import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  __clearQVerisFetchCacheForTests,
  qverisFetchCacheKey,
  qverisFetchTtlMs,
  readQVerisFetchCache,
  writeQVerisFetchCache,
} from "@/lib/capabilities/qverisFetchCache";
import { __setD1ForTests, type D1DatabaseBinding, type D1PreparedStatement } from "@/lib/storage/d1";

const NS = "https://qveris.test/api:qveris-provider-cache:v1";

function reset(t: test.TestContext, db: D1DatabaseBinding | null = null) {
  __clearQVerisFetchCacheForTests();
  __setD1ForTests(db);
  t.after(() => {
    __clearQVerisFetchCacheForTests();
    __setD1ForTests(undefined);
  });
}

test("canonical cache key is stable for reordered object keys", async (t) => {
  reset(t);

  const left = await qverisFetchCacheKey("tool", { b: 2, a: { y: 1, x: 0 }, c: [{ z: 3, q: 4 }] }, NS);
  const right = await qverisFetchCacheKey("tool", { c: [{ q: 4, z: 3 }], a: { x: 0, y: 1 }, b: 2 }, NS);

  assert.equal(left, right);
  assert.match(left, /^[a-f0-9]{64}$/);
});

test("cache key includes non-secret namespace", async (t) => {
  reset(t);

  const left = await qverisFetchCacheKey("tool", { symbol: "AAPL" }, "https://one.test/api:v1");
  const right = await qverisFetchCacheKey("tool", { symbol: "AAPL" }, "https://two.test/api:v1");

  assert.notEqual(left, right);
});

test("expired entries miss", async (t) => {
  reset(t);
  const now = new Date("2026-01-01T00:00:00.000Z");

  await writeQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, { data: { price: 1 } }, NS, now);
  const cached = await readQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, NS, new Date(now.getTime() + 60_001));

  assert.equal(cached, null);
});

test("tool TTLs match capability freshness", () => {
  assert.equal(qverisFetchTtlMs("eodhd.live_v2.us_quote_delayed.retrieve.v1.f0e13d45"), 60_000);
  assert.equal(qverisFetchTtlMs("finnhub.calendar.earnings.retrieve.v1.1552775d"), 30 * 60_000);
  assert.equal(qverisFetchTtlMs("alphavantage.earnings_estimates.retrieve.v1.7aca3c4a"), 30 * 60_000);
  assert.equal(qverisFetchTtlMs("qveris_finance.finance_news_aggregation_v1"), 15 * 60_000);
  assert.equal(qverisFetchTtlMs("financialmodelingprep.stable.secfilingssearch.cik.retrieve.v1.6c73a2ce"), 60 * 60_000);
  assert.equal(qverisFetchTtlMs("finnhub.company.profile.v2.get.v1"), 7 * 24 * 60 * 60_000);
  assert.equal(qverisFetchTtlMs("alphavantage.earnings.retrieve.v1.7aca3c4a"), 24 * 60 * 60_000);
  assert.equal(qverisFetchTtlMs("financialmodelingprep.stable.incomestatement.retrieve.v1.dd6d583f"), 24 * 60 * 60_000);
  assert.equal(qverisFetchTtlMs("financialmodelingprep.stable.revenueproductsegmentation.retrieve.v1.8faa287f"), 24 * 60 * 60_000);
  assert.equal(qverisFetchTtlMs("alphavantage.earnings_call_transcript.query.v1.467a92c0"), 30 * 24 * 60 * 60_000);
  assert.equal(qverisFetchTtlMs("unknown.tool"), 15 * 60_000);
});

test("D1 write upserts and D1 read returns unexpired payload", async (t) => {
  const db = new FakeD1();
  reset(t, db);
  const now = new Date("2026-01-01T00:00:00.000Z");

  await writeQVerisFetchCache("finnhub.company.profile.v2.get.v1", { symbol: "AAPL" }, { data: { name: "Apple" }, executionId: "exec-1" }, NS, now);
  const row = [...db.rows.values()][0];

  assert.equal(db.writes, 1);
  assert.equal(row.tool_id, "finnhub.company.profile.v2.get.v1");
  assert.equal(row.parameters_json, "{\"symbol\":\"AAPL\"}");
  assert.equal(row.response_json, "{\"name\":\"Apple\"}");
  assert.match(String(row.response_hash), /^[a-f0-9]{64}$/);
  assert.equal(row.execution_id, "exec-1");
  assert.equal(row.fetched_at, now.toISOString());
  assert.equal(row.schema_version, 1);

  __clearQVerisFetchCacheForTests();
  const cached = await readQVerisFetchCache("finnhub.company.profile.v2.get.v1", { symbol: "AAPL" }, NS, now);
  assert.deepEqual(cached, { data: { name: "Apple" }, executionId: "exec-1" });
});

test("D1 read ignores rows from another schema version", async (t) => {
  const db = new FakeD1();
  reset(t, db);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const cacheKey = await qverisFetchCacheKey("finnhub.company.profile.v2.get.v1", { symbol: "AAPL" }, NS);
  db.rows.set(cacheKey, {
    cache_key: cacheKey,
    response_json: "{\"name\":\"Stale Apple\"}",
    execution_id: "exec-old",
    expires_at: new Date(now.getTime() + 60_000).toISOString(),
    schema_version: 0,
  });

  const cached = await readQVerisFetchCache("finnhub.company.profile.v2.get.v1", { symbol: "AAPL" }, NS, now);

  assert.equal(cached, null);
});

test("unserializable payloads are not cached in memory or D1", async (t) => {
  const db = new FakeD1();
  reset(t, db);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const data: Record<string, unknown> = {};
  data.self = data;

  await writeQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, { data }, NS, now);

  assert.equal(db.writes, 0);
  assert.equal(await readQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, NS, now), null);

  await writeQVerisFetchCache("quote.retrieve.v1", { symbol: "MSFT" }, { data: undefined }, NS, now);
  assert.equal(db.writes, 0);
  assert.equal(await readQVerisFetchCache("quote.retrieve.v1", { symbol: "MSFT" }, NS, now), null);
});

test("memory hit does not read D1", async (t) => {
  const db = new FakeD1();
  reset(t, db);
  const now = new Date("2026-01-01T00:00:00.000Z");

  await writeQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, { data: { price: 2 } }, NS, now);
  const cached = await readQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, NS, now);

  assert.deepEqual(cached, { data: { price: 2 }, executionId: undefined });
  assert.equal(db.reads, 0);
});

test("memory fallback is shared by separate module bundles", async (t) => {
  reset(t);
  const now = new Date("2026-01-01T00:00:00.000Z");

  await writeQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, { data: { price: 2 }, executionId: "exec-2" }, NS, now);
  const bundled = await importQVerisFetchCacheBundle();

  assert.deepEqual(await bundled.readQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, NS, now), {
    data: { price: 2 },
    executionId: "exec-2",
  });
});

test("memory cache evicts the oldest item above its limit", async (t) => {
  reset(t);
  const now = new Date("2026-01-01T00:00:00.000Z");

  for (let index = 0; index <= 500; index += 1) {
    await writeQVerisFetchCache("unknown.tool", { index }, { data: index }, NS, now);
  }

  assert.equal(await readQVerisFetchCache("unknown.tool", { index: 0 }, NS, now), null);
  assert.deepEqual(await readQVerisFetchCache("unknown.tool", { index: 1 }, NS, now), { data: 1, executionId: undefined });
  assert.deepEqual(await readQVerisFetchCache("unknown.tool", { index: 500 }, NS, now), { data: 500, executionId: undefined });
});

test("D1 retention deletes only unreferenced raw cache older than 90 days at most once per hour", async (t) => {
  const db = new FakeD1();
  reset(t, db);
  const now = new Date("2026-01-01T00:00:00.000Z");
  db.rows.set("old-unreferenced", { cache_key: "old-unreferenced", expires_at: "2025-09-01T00:00:00.000Z", schema_version: 1 });
  db.rows.set("old-source-ref", { cache_key: "old-source-ref", expires_at: "2025-09-01T00:00:00.000Z", schema_version: 1 });
  db.rows.set("old-event-fact", { cache_key: "old-event-fact", expires_at: "2025-09-01T00:00:00.000Z", schema_version: 1 });
  db.rows.set("recent", { cache_key: "recent", expires_at: "2025-12-01T00:00:00.000Z", schema_version: 1 });
  db.sourceRefs.add("old-source-ref");
  db.eventFacts.add("old-event-fact");

  await readQVerisFetchCache("unknown.tool", { miss: 1 }, NS, now);
  await readQVerisFetchCache("unknown.tool", { miss: 2 }, NS, new Date(now.getTime() + 30 * 60_000));

  assert.equal(db.rows.has("old-unreferenced"), false);
  assert.equal(db.rows.has("old-source-ref"), true);
  assert.equal(db.rows.has("old-event-fact"), true);
  assert.equal(db.rows.has("recent"), true);
  assert.equal(db.deletes, 1);
  assert.equal(db.deleteSqls.length, 1);
  assert.match(db.deleteSqls[0], /NOT EXISTS \(SELECT 1 FROM source_refs/i);
  assert.match(db.deleteSqls[0], /NOT EXISTS \(SELECT 1 FROM event_facts/i);
});

test("D1 failures log safely and do not block memory fallback", async (t) => {
  reset(t, new ThrowingD1());
  const now = new Date("2026-01-01T00:00:00.000Z");
  const errors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  t.after(() => {
    console.error = originalConsoleError;
  });

  await writeQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, { data: { price: 2 }, executionId: "exec-2" }, NS, now);
  const cached = await readQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, NS, now);

  assert.deepEqual(cached, { data: { price: 2 }, executionId: "exec-2" });
  assert.deepEqual(errors, [["QVeris cache retention failed"], ["QVeris cache write failed", "quote.retrieve.v1"]]);

  __clearQVerisFetchCacheForTests();
  assert.equal(await readQVerisFetchCache("quote.retrieve.v1", { symbol: "AAPL" }, NS, now), null);
  assert.deepEqual(errors[3], ["QVeris cache read failed", "quote.retrieve.v1"]);
});

async function importQVerisFetchCacheBundle() {
  const url = pathToFileURL(resolve("lib/capabilities/qverisFetchCache.ts"));
  return import(`${url.href}?bundle=${Date.now()}`) as Promise<typeof import("./qverisFetchCache")>;
}

class ThrowingD1 implements D1DatabaseBinding {
  prepare(): D1PreparedStatement {
    throw new Error("D1 down");
  }
}

class FakeD1 implements D1DatabaseBinding {
  readonly rows = new Map<string, Record<string, unknown>>();
  readonly sourceRefs = new Set<string>();
  readonly eventFacts = new Set<string>();
  reads = 0;
  writes = 0;
  deletes = 0;
  deleteSqls: string[] = [];

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(private db: FakeD1, private sql: string) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    this.db.reads += 1;
    const row = this.db.rows.get(String(this.values[0]));
    if (
      !row
      || !/FROM qveris_fetch_cache/i.test(this.sql)
      || row.schema_version !== this.values[1]
      || String(row.expires_at) <= String(this.values[2])
    ) return null;
    return row as T;
  }

  async all<T>(): Promise<{ results?: T[] }> {
    return { results: [] };
  }

  async run(): Promise<unknown> {
    if (/^DELETE FROM qveris_fetch_cache/i.test(this.sql)) {
      this.db.deleteSqls.push(this.sql);
      for (const [key, row] of this.db.rows) {
        if (
          String(row.expires_at) < String(this.values[0])
          && !this.db.sourceRefs.has(key)
          && !this.db.eventFacts.has(key)
        ) this.db.rows.delete(key);
      }
      this.db.deletes += 1;
      return {};
    }
    const row = {
      cache_key: this.values[0],
      tool_id: this.values[1],
      parameters_json: this.values[2],
      response_json: this.values[3],
      response_hash: this.values[4],
      execution_id: this.values[5],
      fetched_at: this.values[6],
      expires_at: this.values[7],
      schema_version: this.values[8],
    };
    this.db.rows.set(String(row.cache_key), row);
    this.db.writes += 1;
    return {};
  }
}
