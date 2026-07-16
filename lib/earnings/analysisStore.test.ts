import assert from "node:assert/strict";
import { resolve } from "node:path";
import test, { afterEach } from "node:test";
import { pathToFileURL } from "node:url";
import {
  __clearAnalysisStoreForTests,
  getAnalysisById,
  getCachedAnalysis,
  listAnalysesByTicker,
  saveAnalysis,
} from "@/lib/earnings/analysisStore";
import type { AnalyzeEarningsRequest, EarningsAnalysis } from "@/lib/earnings/types";
import { D1PersistenceError, __setD1ForTests, type D1DatabaseBinding, type D1PreparedStatement } from "@/lib/storage/d1";

afterEach(() => {
  __setD1ForTests(undefined);
  __clearAnalysisStoreForTests();
});

test("first save persists schema-correct assets before the snapshot", async () => {
  const db = new FakeD1();
  const request = sampleRequest();
  const analysis = sampleAnalysis();
  __setD1ForTests(db);

  await saveAnalysis(request, analysis);
  assert.equal(db.table("research_snapshots").size, 1);
  assert.equal(db.table("earnings_events").size, 1);
  assert.equal(db.table("source_refs").size, 1);
  assert.equal(db.table("event_facts").size, 9);
  assert.deepEqual(db.writeOrder, [
    "earnings_events",
    "source_refs",
    ...Array(9).fill("event_facts"),
    "research_snapshots",
  ]);

  const eventId = "NVDA:2026:Q1:20260201";
  const event = db.table("earnings_events").get(eventId)!;
  assert.deepEqual(Object.keys(event), [
    "event_id",
    "canonical_key",
    "ticker",
    "fiscal_year",
    "fiscal_period",
    "report_date",
    "timing",
    "status",
    "event_version",
    "data_as_of",
    "first_seen_at",
    "last_seen_at",
  ]);
  assert.equal(event.canonical_key, "NVDA:2026:Q1");
  assert.equal(event.event_version, 20260201);

  const sourceId = "src-1:2026-01-15T12:00:00.000Z";
  const source = db.table("source_refs").get(sourceId)!;
  assert.deepEqual(Object.keys(source), [
    "source_ref_id",
    "provider",
    "capability",
    "execution_id",
    "raw_fetch_id",
    "title",
    "url",
    "published_at",
    "retrieved_at",
    "source_hash",
  ]);
  assert.equal(source.source_hash, sourceId);

  const facts = db.table("event_facts");
  assert.deepEqual(facts.get(`${eventId}:revenue_actual:v1`), {
    fact_id: `${eventId}:revenue_actual:v1`,
    event_id: eventId,
    fact_type: "actual",
    metric: "revenue_actual",
    period_key: "2026:Q1",
    value_number: 1,
    value_text: null,
    unit: "currency",
    currency: "USD",
    source_ref_id: sourceId,
    raw_fetch_id: null,
    fact_version: 1,
    as_of: analysis.generatedAt,
  });
  assert.equal(facts.get(`${eventId}:revenue_estimate:v1`)?.fact_type, "estimate");
  assert.equal(facts.get(`${eventId}:revenue_estimate:v1`)?.value_number, 0.9);
  assert.equal(facts.get(`${eventId}:guidance_text:v1`)?.fact_type, "guidance");
  assert.equal(facts.get(`${eventId}:guidance_text:v1`)?.value_text, "Revenue guidance raised");
  assert.equal(facts.get(`${eventId}:market_close_change_pct:v1`)?.fact_type, "market");
  assert.equal(facts.get(`${eventId}:market_close_change_pct:v1`)?.value_number, 4.2);
  for (const fact of facts.values()) {
    assert.notEqual(fact.value_number === null, fact.value_text === null);
  }

  const snapshot = db.table("research_snapshots").get(analysis.analysisId)!;
  assert.equal(snapshot.event_id, eventId);
  assert.equal(snapshot.snapshot_version, 1);

  __clearAnalysisStoreForTests();
  assert.equal((await getAnalysisById(analysis.analysisId))?.analysisId, analysis.analysisId);
});

test("same fiscal quarter date revisions persist as separate event versions", async () => {
  const db = new FakeD1();
  __setD1ForTests(db);

  const first = sampleAnalysis({
    analysisId: "NVDA-combined-20260201T120000Z",
    event: {
      ...sampleAnalysis().event!,
      id: "evt-nvda-2026q1",
      reportDate: "2026-02-01",
    },
  });
  const revised = sampleAnalysis({
    analysisId: "NVDA-combined-20260214T120000Z",
    event: {
      ...sampleAnalysis().event!,
      id: "evt-nvda-2026q1",
      reportDate: "2026-02-14",
    },
  });

  await saveAnalysis(sampleRequest(), first);
  await saveAnalysis(sampleRequest(), revised);

  const events = db.table("earnings_events");
  assert.equal(events.size, 2);
  assert.equal(events.get("NVDA:2026:Q1:20260201")?.canonical_key, "NVDA:2026:Q1");
  assert.equal(events.get("NVDA:2026:Q1:20260214")?.canonical_key, "NVDA:2026:Q1");
  assert.equal(events.get("NVDA:2026:Q1:20260201")?.event_version, 20260201);
  assert.equal(events.get("NVDA:2026:Q1:20260214")?.event_version, 20260214);

  const snapshots = db.table("research_snapshots");
  assert.equal(snapshots.get(first.analysisId)?.event_id, "NVDA:2026:Q1:20260201");
  assert.equal(snapshots.get(revised.analysisId)?.event_id, "NVDA:2026:Q1:20260214");
});

test("event fact revisions append versions without overwriting old values", async () => {
  const db = new FakeD1();
  __setD1ForTests(db);
  const eventId = "NVDA:2026:Q1:20260201";
  const factKey = `${eventId}:revenue_actual`;
  const first = sampleAnalysis({ analysisId: "NVDA-combined-fact-v1" });
  const same = sampleAnalysis({ analysisId: "NVDA-combined-fact-same" });
  const revised = sampleAnalysis({
    analysisId: "NVDA-combined-fact-v2",
    generatedAt: "2026-01-16T12:00:00.000Z",
    results: {
      ...sampleAnalysis().results!,
      revenueActual: 1.25,
    },
  });

  await saveAnalysis(sampleRequest(), first);
  assert.equal(db.table("event_facts").get(`${factKey}:v1`)?.value_number, 1);
  assert.equal(db.table("event_facts").get(`${factKey}:v1`)?.fact_version, 1);

  await saveAnalysis(sampleRequest(), same);
  assert.equal([...db.table("event_facts").keys()].filter((key) => String(key).startsWith(factKey)).length, 1);

  await saveAnalysis(sampleRequest(), revised);
  assert.equal(db.table("event_facts").get(`${factKey}:v1`)?.value_number, 1);
  assert.equal(db.table("event_facts").get(`${factKey}:v2`)?.value_number, 1.25);
  assert.equal(db.table("event_facts").get(`${factKey}:v2`)?.fact_version, 2);
});

test("source refs are versioned by execution and facts link raw fetch rows", async () => {
  const db = new FakeD1();
  __setD1ForTests(db);
  db.table("qveris_fetch_cache").set("raw-older", {
    cache_key: "raw-older",
    execution_id: "exec-1",
    fetched_at: "2026-01-15T11:59:00.000Z",
  });
  db.table("qveris_fetch_cache").set("raw-1", {
    cache_key: "raw-1",
    execution_id: "exec-1",
    fetched_at: "2026-01-15T12:00:00.000Z",
  });
  db.table("qveris_fetch_cache").set("raw-2", {
    cache_key: "raw-2",
    execution_id: "exec-2",
    fetched_at: "2026-01-16T12:00:00.000Z",
  });

  await saveAnalysis(sampleRequest(), sampleAnalysisWithSourceExecution("exec-1"));
  await saveAnalysis(sampleRequest(), sampleAnalysisWithSourceExecution("exec-2", {
    analysisId: "NVDA-combined-exec-2",
    generatedAt: "2026-01-16T12:00:00.000Z",
  }));

  assert.equal(db.table("source_refs").size, 2);
  assert.equal(db.table("source_refs").get("src-1:exec-1")?.raw_fetch_id, "raw-1");
  assert.equal(db.table("source_refs").get("src-1:exec-2")?.raw_fetch_id, "raw-2");

  const eventId = "NVDA:2026:Q1:20260201";
  assert.equal(db.table("event_facts").get(`${eventId}:revenue_actual:v1`)?.source_ref_id, "src-1:exec-1");
  assert.equal(db.table("event_facts").get(`${eventId}:revenue_actual:v1`)?.raw_fetch_id, "raw-1");
  assert.equal(db.table("event_facts").get(`${eventId}:revenue_actual:v2`)?.source_ref_id, "src-1:exec-2");
  assert.equal(db.table("event_facts").get(`${eventId}:revenue_actual:v2`)?.raw_fetch_id, "raw-2");

  const snapshot = JSON.parse(String(db.table("research_snapshots").get("NVDA-combined-exec-2")?.analysis_json)) as EarningsAnalysis;
  assert.equal(snapshot.sources[0]?.id, "src-1");
});

test("source refs and facts keep raw fetch null when execution has no raw cache row", async () => {
  const db = new FakeD1();
  __setD1ForTests(db);

  await saveAnalysis(sampleRequest(), sampleAnalysisWithSourceExecution("exec-missing"));

  assert.equal(db.table("source_refs").get("src-1:exec-missing")?.raw_fetch_id, null);
  assert.equal(db.table("event_facts").get("NVDA:2026:Q1:20260201:revenue_actual:v1")?.source_ref_id, "src-1:exec-missing");
  assert.equal(db.table("event_facts").get("NVDA:2026:Q1:20260201:revenue_actual:v1")?.raw_fetch_id, null);
});

test("event fact concurrent revisions retry instead of dropping a conflicting version", async () => {
  const db = new FakeD1();
  __setD1ForTests(db);
  const eventId = "NVDA:2026:Q1:20260201";
  const factKey = `${eventId}:revenue_actual`;

  await saveAnalysis(sampleRequest(), sampleAnalysis({ analysisId: "NVDA-combined-fact-v1" }));

  let collided = false;
  db.beforeInsert = (table, row) => {
    if (collided || table !== "event_facts" || row.fact_id !== `${factKey}:v2`) return;
    collided = true;
    db.table("event_facts").set(String(row.fact_id), {
      ...row,
      value_number: 1.1,
      as_of: "2026-01-16T11:59:00.000Z",
    });
  };

  await saveAnalysis(sampleRequest(), sampleAnalysis({
    analysisId: "NVDA-combined-fact-v3",
    generatedAt: "2026-01-16T12:00:00.000Z",
    results: {
      ...sampleAnalysis().results!,
      revenueActual: 1.25,
    },
  }));

  assert.equal(db.table("event_facts").get(`${factKey}:v2`)?.value_number, 1.1);
  assert.equal(db.table("event_facts").get(`${factKey}:v3`)?.value_number, 1.25);
});

test("request cache expiry does not expire analysis id reads", async () => {
  const db = new FakeD1();
  const request = sampleRequest();
  const analysis = sampleAnalysis();
  __setD1ForTests(db);

  await saveAnalysis(request, analysis);
  db.table("research_snapshots").get(analysis.analysisId)!.cache_expires_at = "2000-01-01T00:00:00.000Z";
  __clearAnalysisStoreForTests();

  assert.equal(await getCachedAnalysis(request), null);
  assert.equal((await getAnalysisById(analysis.analysisId))?.analysisId, analysis.analysisId);
});

test("old-format analysis ids remain readable", async () => {
  const db = new FakeD1();
  const analysis = sampleAnalysis({ analysisId: "NVDA-combined-20260115T120000Z" });
  __setD1ForTests(db);

  await saveAnalysis(sampleRequest(), analysis);
  __clearAnalysisStoreForTests();

  assert.equal((await getAnalysisById("NVDA-combined-20260115T120000Z"))?.analysisId, analysis.analysisId);
});

test("snapshot id collisions do not overwrite persisted payloads", async () => {
  const db = new FakeD1();
  const first = sampleAnalysis({ summaryBullets: ["first"] });
  const collided = sampleAnalysis({ summaryBullets: ["second"] });
  __setD1ForTests(db);

  await saveAnalysis(sampleRequest(), first);
  await saveAnalysis(sampleRequest(), collided);

  const stored = JSON.parse(String(db.table("research_snapshots").get(first.analysisId)?.analysis_json)) as EarningsAnalysis;
  assert.deepEqual(stored.summaryBullets, ["first"]);
  assert.notEqual(collided.analysisId, first.analysisId);
  assert.equal(db.table("research_snapshots").size, 2);
  assert.deepEqual(
    (JSON.parse(String(db.table("research_snapshots").get(collided.analysisId)?.analysis_json)) as EarningsAnalysis).summaryBullets,
    ["second"],
  );
});

test("retryable data issue snapshots persist without request-cache reuse", async () => {
  const db = new FakeD1();
  const request = sampleRequest();
  const analysis = sampleAnalysis({
    issues: [{
      capability: "filings",
      code: "upstream_timeout",
      retryable: true,
      occurredAt: "2026-01-15T12:00:00.000Z",
    }],
  });
  __setD1ForTests(db);

  await saveAnalysis(request, analysis);

  const snapshot = db.table("research_snapshots").get(analysis.analysisId)!;
  assert.ok(Date.parse(String(snapshot.cache_expires_at)) <= Date.now());
  assert.equal(await getCachedAnalysis(request), null);
  assert.equal((await getAnalysisById(analysis.analysisId))?.analysisId, analysis.analysisId);

  __clearAnalysisStoreForTests();
  assert.equal(await getCachedAnalysis(request), null);
  assert.equal((await getAnalysisById(analysis.analysisId))?.analysisId, analysis.analysisId);
  assert.equal(await getCachedAnalysis(request), null);
});

test("request cache checks warm memory before D1", async () => {
  const db = new FakeD1();
  const request = sampleRequest();
  const analysis = sampleAnalysis();
  __setD1ForTests(db);

  await saveAnalysis(request, analysis);
  db.throwOnRequestLookup = true;

  assert.equal((await getCachedAnalysis(request))?.analysisId, analysis.analysisId);
  assert.equal(db.requestLookups, 0);
});

test("memory fallback is shared by separate module bundles", async () => {
  const request = sampleRequest();
  const analysis = sampleAnalysis();

  await saveAnalysis(request, analysis);
  const bundled = await importAnalysisStoreBundle();

  assert.equal((await bundled.getCachedAnalysis(request))?.analysisId, analysis.analysisId);
  assert.equal((await bundled.getAnalysisById(analysis.analysisId))?.analysisId, analysis.analysisId);
});

test("empty fact values are not persisted and missing sources become null", async () => {
  const db = new FakeD1();
  const analysis = sampleAnalysis();
  analysis.results = { ticker: "NVDA", sourceIds: ["missing-source"] };
  analysis.estimates = null;
  analysis.marketReaction = null;
  analysis.event = { ...analysis.event!, revenueEstimate: undefined, epsEstimate: undefined };
  __setD1ForTests(db);

  await saveAnalysis(sampleRequest(), analysis);

  const facts = [...db.table("event_facts").values()];
  assert.deepEqual(facts.map((fact) => fact.metric).sort(), ["eps_actual", "revenue_actual"]);
  assert.ok(facts.every((fact) => fact.source_ref_id === null));
  assert.ok(facts.every((fact) => fact.value_number !== null && fact.value_text === null));
});

test("D1 failures fall back to memory without dropping the current save", async () => {
  const request = sampleRequest();
  const analysis = sampleAnalysis();
  __setD1ForTests(new ThrowingD1());

  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await saveAnalysis(request, analysis);
  } finally {
    console.error = originalError;
  }

  assert.equal((await getCachedAnalysis(request))?.analysisId, analysis.analysisId);
  assert.equal((await getAnalysisById(analysis.analysisId))?.analysisId, analysis.analysisId);
  assert.deepEqual(errors, [[
    "D1 analysis persistence failed",
    { analysisId: analysis.analysisId, error: "Error" },
  ]]);
});

test("production requires D1 binding instead of memory-only success", async () => {
  const request = sampleRequest();
  const analysis = sampleAnalysis();
  __setD1ForTests(null);
  await saveAnalysis(request, analysis);
  assert.equal((await getCachedAnalysis(request))?.analysisId, analysis.analysisId);

  await withNodeEnv("production", async () => {
    __setD1ForTests(null);

    await assert.rejects(
      getCachedAnalysis(request),
      (error) => error instanceof D1PersistenceError && error.code === "D1_BINDING_MISSING",
    );
    await assert.rejects(
      saveAnalysis(request, analysis),
      (error) => error instanceof D1PersistenceError && error.code === "D1_BINDING_MISSING",
    );
  });
});

test("production D1 read and write failures throw controlled errors", async () => {
  await withNodeEnv("production", async () => {
    __setD1ForTests(new ThrowingD1());

    await assert.rejects(
      saveAnalysis(sampleRequest(), sampleAnalysis()),
      (error) => error instanceof D1PersistenceError && error.code === "D1_WRITE_FAILED",
    );
    await assert.rejects(
      getAnalysisById("NVDA-combined-20260115T120000Z"),
      (error) => error instanceof D1PersistenceError && error.code === "D1_READ_FAILED",
    );
  });
});

test("listAnalysesByTicker reads persisted snapshots by newest first", async () => {
  const db = new FakeD1();
  __setD1ForTests(db);

  await saveAnalysis(sampleRequest(), sampleAnalysis({
    analysisId: "NVDA-combined-20260101T000000Z",
    generatedAt: "2026-01-01T00:00:00.000Z",
  }));
  await saveAnalysis(sampleRequest(), sampleAnalysis({
    analysisId: "NVDA-combined-20260201T000000Z",
    generatedAt: "2026-02-01T00:00:00.000Z",
  }));
  __clearAnalysisStoreForTests();

  const rows = await listAnalysesByTicker("nvda", 2);
  assert.deepEqual(rows.map((row) => row.analysisId), [
    "NVDA-combined-20260201T000000Z",
    "NVDA-combined-20260101T000000Z",
  ]);
});

test("ticker normalization is stable across persisted and memory history lookups", async () => {
  const db = new FakeD1();
  const analysis = sampleAnalysis({
    ticker: "nvda",
    event: { ...sampleAnalysis().event!, ticker: "nvda" },
  });
  __setD1ForTests(db);

  await saveAnalysis(sampleRequest(), analysis);

  assert.equal(db.table("research_snapshots").get(analysis.analysisId)?.ticker, "NVDA");
  assert.equal(db.table("earnings_events").get("NVDA:2026:Q1:20260201")?.ticker, "NVDA");
  assert.equal((await listAnalysesByTicker("$NVDA", 1))[0]?.analysisId, analysis.analysisId);

  __setD1ForTests(null);
  assert.equal((await listAnalysesByTicker("NVDA", 1))[0]?.analysisId, analysis.analysisId);
});

function sampleRequest(): AnalyzeEarningsRequest {
  return { ticker: "NVDA", mode: "auto", includeTranscript: true };
}

async function importAnalysisStoreBundle() {
  const url = pathToFileURL(resolve("lib/earnings/analysisStore.ts"));
  return import(`${url.href}?bundle=${Date.now()}`) as Promise<typeof import("./analysisStore")>;
}

async function withNodeEnv(value: string, fn: () => Promise<void>) {
  const env = process.env as Record<string, string | undefined>;
  const original = env.NODE_ENV;
  env.NODE_ENV = value;
  try {
    await fn();
  } finally {
    if (original === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = original;
    }
  }
}

function sampleAnalysis(overrides: Partial<EarningsAnalysis> = {}): EarningsAnalysis {
  return {
    analysisId: "NVDA-combined-20260115T120000Z",
    ticker: "NVDA",
    language: "en",
    mode: "combined",
    company: {
      ticker: "NVDA",
      name: "NVIDIA",
      currency: "USD",
      sourceIds: ["src-1"],
    },
    event: {
      id: "evt-nvda-2026q1",
      ticker: "NVDA",
      fiscalPeriod: "Q1",
      fiscalYear: 2026,
      reportDate: "2026-02-01",
      timing: "after_close",
      status: "reported",
      revenueActual: 1,
      epsActual: 2,
      revenueEstimate: 1,
      epsEstimate: 2,
      sourceIds: ["src-1"],
    },
    upcomingEvent: null,
    recentEvent: null,
    estimates: {
      ticker: "NVDA",
      revenueEstimate: 0.9,
      epsEstimate: 1.8,
      sourceIds: ["src-1"],
      fieldSourceIds: { revenueEstimate: ["src-1"], epsEstimate: ["src-1"] },
    },
    results: {
      ticker: "NVDA",
      revenueActual: 1,
      epsActual: 2,
      grossMargin: 0.55,
      operatingMargin: 0.35,
      netIncome: 0.4,
      guidanceText: "Revenue guidance raised",
      sourceIds: ["src-1"],
      fieldSourceIds: {
        revenueActual: ["src-1"],
        epsActual: ["src-1"],
        grossMargin: ["src-1"],
        operatingMargin: ["src-1"],
        netIncome: ["src-1"],
        guidanceText: ["src-1"],
      },
    },
    quote: null,
    marketReaction: {
      eventDate: "2026-02-01",
      baselineSessionDate: "2026-01-30",
      reactionSessionDate: "2026-02-02",
      basis: "next_session",
      closeChangePct: 4.2,
      sourceIds: ["src-1"],
    },
    financials: [],
    segmentRevenue: [],
    historicalPattern: [],
    historicalSummary: {
      revenueBeatCount: 0,
      epsBeatCount: 0,
      revenueDataPoints: 0,
      epsDataPoints: 0,
      quarters: 0,
      averageOneDayMovePct: 0,
      limitedHistory: true,
    },
    news: [],
    filings: [],
    transcript: null,
    analystRevisions: [],
    oneLineVerdict: "ok",
    eventStatus: [],
    whatChanged: [],
    keyQuestions: [],
    keyDrivers: [],
    riskSignals: [],
    qualityOfEarnings: [],
    summaryBullets: ["ok"],
    watchNext: [],
    confidence: { label: "medium", reason: "test" },
    caveats: [],
    capabilityStatus: {},
    missing: [],
    conflicts: [],
    sources: [{
      id: "src-1",
      title: "Source",
      provider: "QVeris",
      url: "https://example.com",
      retrievedAt: "2026-01-15T12:00:00.000Z",
    }],
    generatedAt: "2026-01-15T12:00:00.000Z",
    ...overrides,
  };
}

function sampleAnalysisWithSourceExecution(executionId: string, overrides: Partial<EarningsAnalysis> = {}) {
  return sampleAnalysis({
    sources: [{
      id: "src-1",
      title: "Source",
      provider: "QVeris",
      url: "https://example.com",
      retrievedAt: "2026-01-15T12:00:00.000Z",
      executionId,
    }],
    ...overrides,
  });
}

class ThrowingD1 implements D1DatabaseBinding {
  prepare(): D1PreparedStatement {
    throw new Error("D1 down");
  }
}

class FakeD1 implements D1DatabaseBinding {
  private rows = new Map<string, Map<string, Record<string, unknown>>>();
  readonly writeOrder: string[] = [];
  requestLookups = 0;
  throwOnRequestLookup = false;
  beforeInsert?: (table: string, row: Record<string, unknown>) => void;
  private schemas = new Map<string, string[]>([
    ["research_snapshots", [
      "analysis_id",
      "request_key",
      "ticker",
      "event_id",
      "mode",
      "language",
      "snapshot_version",
      "analysis_json",
      "generated_at",
      "cache_expires_at",
      "created_at",
      "updated_at",
    ]],
    ["earnings_events", [
      "event_id",
      "canonical_key",
      "ticker",
      "fiscal_year",
      "fiscal_period",
      "report_date",
      "timing",
      "status",
      "event_version",
      "data_as_of",
      "first_seen_at",
      "last_seen_at",
    ]],
    ["source_refs", [
      "source_ref_id",
      "provider",
      "capability",
      "execution_id",
      "raw_fetch_id",
      "title",
      "url",
      "published_at",
      "retrieved_at",
      "source_hash",
    ]],
    ["qveris_fetch_cache", [
      "cache_key",
      "execution_id",
      "fetched_at",
    ]],
    ["event_facts", [
      "fact_id",
      "event_id",
      "fact_type",
      "metric",
      "period_key",
      "value_number",
      "value_text",
      "unit",
      "currency",
      "source_ref_id",
      "raw_fetch_id",
      "fact_version",
      "as_of",
    ]],
  ]);

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(this, sql);
  }

  table(name: string) {
    let table = this.rows.get(name);
    if (!table) {
      table = new Map();
      this.rows.set(name, table);
    }
    return table;
  }

  columns(name: string) {
    return this.schemas.get(name) ?? [];
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
    const snapshots = [...this.db.table("research_snapshots").values()];
    if (/FROM qveris_fetch_cache/i.test(this.sql)) {
      return ([...this.db.table("qveris_fetch_cache").values()]
        .filter((row) => row.execution_id === this.values[0])
        .sort((a, b) => String(b.fetched_at).localeCompare(String(a.fetched_at)))[0] as T | undefined) ?? null;
    }
    if (/WHERE fact_id = \?/i.test(this.sql)) {
      return (this.db.table("event_facts").get(String(this.values[0])) as T | undefined) ?? null;
    }
    if (/FROM event_facts/i.test(this.sql)) {
      return ([...this.db.table("event_facts").values()]
        .filter((row) => row.event_id === this.values[0]
          && row.fact_type === this.values[1]
          && row.metric === this.values[2]
          && row.period_key === this.values[3])
        .sort((a, b) => Number(b.fact_version) - Number(a.fact_version))[0] as T | undefined) ?? null;
    }
    if (/WHERE analysis_id = \?/i.test(this.sql)) {
      return (this.db.table("research_snapshots").get(String(this.values[0])) as T | undefined) ?? null;
    }
    if (/WHERE request_key = \?/i.test(this.sql)) {
      this.db.requestLookups += 1;
      if (this.db.throwOnRequestLookup) throw new Error("request lookup should not run");
      return (snapshots
        .filter((row) => row.request_key === this.values[0] && String(row.cache_expires_at) > String(this.values[1]))
        .sort(byGeneratedAtDesc)[0] as T | undefined) ?? null;
    }
    return null;
  }

  async all<T>(): Promise<{ results?: T[] }> {
    if (/WHERE ticker = \?/i.test(this.sql)) {
      const limit = Number(this.values[1]);
      return {
        results: [...this.db.table("research_snapshots").values()]
          .filter((row) => row.ticker === this.values[0])
          .sort(byGeneratedAtDesc)
          .slice(0, limit) as T[],
      };
    }
    return { results: [] };
  }

  async run(): Promise<unknown> {
    const parsed = this.sql.match(/INSERT INTO\s+"?([a-z_]+)"?\s*\(([^)]+)\)/i);
    if (!parsed) return {};
    const table = parsed[1];
    const cols = parsed[2].split(",").map((name) => name.trim().replaceAll('"', ""));
    const schema = this.db.columns(table);
    for (const column of cols) {
      if (!schema.includes(column)) throw new Error(`Unknown ${table} column: ${column}`);
    }
    const row = Object.fromEntries(cols.map((name, index) => [name, this.values[index]]));
    if (table === "research_snapshots" && row.event_id !== null && !this.db.table("earnings_events").has(String(row.event_id))) {
      throw new Error("FOREIGN KEY constraint failed: research_snapshots.event_id");
    }
    if (table === "event_facts" && !this.db.table("earnings_events").has(String(row.event_id))) {
      throw new Error("FOREIGN KEY constraint failed: event_facts.event_id");
    }
    if (table === "event_facts" && row.source_ref_id !== null && !this.db.table("source_refs").has(String(row.source_ref_id))) {
      throw new Error("FOREIGN KEY constraint failed: event_facts.source_ref_id");
    }
    if (table === "source_refs" && row.raw_fetch_id !== null && !this.db.table("qveris_fetch_cache").has(String(row.raw_fetch_id))) {
      throw new Error("FOREIGN KEY constraint failed: source_refs.raw_fetch_id");
    }
    if (table === "event_facts" && row.raw_fetch_id !== null && !this.db.table("qveris_fetch_cache").has(String(row.raw_fetch_id))) {
      throw new Error("FOREIGN KEY constraint failed: event_facts.raw_fetch_id");
    }
    const pk = table === "research_snapshots"
      ? "analysis_id"
      : table === "earnings_events"
        ? "event_id"
        : table === "source_refs"
          ? "source_ref_id"
          : table === "qveris_fetch_cache" ? "cache_key" : "fact_id";
    this.db.beforeInsert?.(table, row);
    const previous = this.db.table(table).get(String(row[pk]));
    if (previous && /DO NOTHING/i.test(this.sql)) return {};
    this.db.table(table).set(String(row[pk]), { ...previous, ...row });
    this.db.writeOrder.push(table);
    return {};
  }
}

function byGeneratedAtDesc(a: Record<string, unknown>, b: Record<string, unknown>) {
  return String(b.generated_at).localeCompare(String(a.generated_at));
}
