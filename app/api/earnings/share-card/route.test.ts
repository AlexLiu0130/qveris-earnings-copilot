import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/earnings/share-card/route";
import { GET as GETImage } from "@/app/api/earnings/share-card/image/route";
import { __clearAnalysisStoreForTests, getCachedAnalysis, saveAnalysis } from "@/lib/earnings/analysisStore";
import { __setD1ForTests } from "@/lib/storage/d1";
import { sampleAnalysis } from "@/app/api/earnings/_testAnalysis";

test("share-card route reports stored analysis cache hits", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  t.after(() => __setD1ForTests(undefined));

  const analysis = sampleAnalysis();
  await saveAnalysis({ ticker: analysis.ticker, mode: analysis.mode, includeTranscript: true }, analysis);

  const res = await POST(jsonRequest({ analysisId: analysis.analysisId }));
  const body = await res.json() as {
    cache?: { hit?: boolean };
    generatedAt?: string;
    sources?: unknown[];
    missing?: string[];
    capabilityStatus?: Record<string, string>;
    confidence?: { label?: string };
  };
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-QVeris-Analysis-Cache"), "HIT");
  assert.equal(body.cache?.hit, true);
  assert.equal(body.generatedAt, analysis.generatedAt);
  assert.deepEqual(body.sources, analysis.sources);
  assert.deepEqual(body.missing, analysis.missing);
  assert.deepEqual(body.capabilityStatus, analysis.capabilityStatus);
  assert.deepEqual(body.confidence, analysis.confidence);
});

test("share-card route preserves known 400 and 404 errors", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  t.after(() => __setD1ForTests(undefined));

  const invalid = await POST(jsonRequest({}));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "INVALID_TICKER" });

  const missing = await POST(jsonRequest({ analysisId: "missing" }));
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "ANALYSIS_NOT_FOUND" });

  const missingWithTicker = await POST(jsonRequest({ analysisId: "missing", ticker: "NVDA" }));
  assert.equal(missingWithTicker.status, 404);
  assert.deepEqual(await missingWithTicker.json(), { error: "ANALYSIS_NOT_FOUND" });

  const invalidTicker = await POST(jsonRequest({ ticker: "not a ticker" }));
  assert.equal(invalidTicker.status, 400);
  assert.deepEqual(await invalidTicker.json(), { error: "INVALID_TICKER" });
});

test("share-card image route validates ticker-only requests and never falls back from analysisId", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  t.after(() => __setD1ForTests(undefined));

  const analysis = sampleAnalysis();
  await saveAnalysis({ ticker: analysis.ticker, mode: analysis.mode, includeTranscript: true }, analysis);
  const storedWithInvalidTicker = await GETImage(new Request(`http://localhost/api/earnings/share-card/image?analysisId=${analysis.analysisId}&ticker=not%20a%20ticker`));
  assert.equal(storedWithInvalidTicker.status, 200);
  assert.equal(storedWithInvalidTicker.headers.get("X-QVeris-Analysis-Cache"), "HIT");

  const missingWithTicker = await GETImage(new Request("http://localhost/api/earnings/share-card/image?analysisId=missing&ticker=NVDA"));
  assert.equal(missingWithTicker.status, 404);
  assert.deepEqual(await missingWithTicker.json(), { error: "ANALYSIS_NOT_FOUND" });

  const invalidTicker = await GETImage(new Request("http://localhost/api/earnings/share-card/image?ticker=not%20a%20ticker"));
  assert.equal(invalidTicker.status, 400);
  assert.deepEqual(await invalidTicker.json(), { error: "INVALID_TICKER" });
});

test("share-card image route saves ticker-only fresh analysis before rendering", async (t) => {
  const oldProvider = process.env.EARNINGS_PROVIDER;
  const oldAllowDemoData = process.env.ALLOW_DEMO_DATA;
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  process.env.EARNINGS_PROVIDER = "mock";
  process.env.ALLOW_DEMO_DATA = "true";
  t.after(() => {
    __setD1ForTests(undefined);
    if (oldProvider === undefined) delete process.env.EARNINGS_PROVIDER;
    else process.env.EARNINGS_PROVIDER = oldProvider;
    if (oldAllowDemoData === undefined) delete process.env.ALLOW_DEMO_DATA;
    else process.env.ALLOW_DEMO_DATA = oldAllowDemoData;
  });

  const res = await GETImage(new Request("http://localhost/api/earnings/share-card/image?ticker=NVDA"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-QVeris-Analysis-Cache"), "MISS");
  assert.match(await res.text(), /<svg /);

  const stored = await getCachedAnalysis({
    ticker: "NVDA",
    mode: "auto",
    language: "en",
    includeTranscript: true,
    includeAiSummary: false,
  });
  assert.equal(stored?.ticker, "NVDA");
});

test("share-card route hides non-whitelisted 500 errors", async () => {
  const res = await POST(new Request("http://localhost/api/earnings/share-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "INTERNAL_ERROR" });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/earnings/share-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
