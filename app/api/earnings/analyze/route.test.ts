import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/earnings/analyze/route";
import { __clearAnalysisStoreForTests, saveAnalysis } from "@/lib/earnings/analysisStore";
import { __setD1ForTests } from "@/lib/storage/d1";
import { sampleAnalysis } from "@/app/api/earnings/_testAnalysis";

test("analyze route reports request-cache hits", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  t.after(() => __setD1ForTests(undefined));

  const request = { ticker: "NVDA", mode: "auto" as const };
  await saveAnalysis(request, sampleAnalysis());

  const res = await POST(jsonRequest(request));
  const body = await res.json() as { cache?: { hit?: boolean } };
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-QVeris-Analysis-Cache"), "HIT");
  assert.equal(body.cache?.hit, true);
});

test("analyze route preserves known 400 errors", async () => {
  const res = await POST(jsonRequest({ ticker: "" }));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "INVALID_TICKER" });
});

test("analyze route maps unavailable earnings data to safe no-store 502", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  const originalProvider = process.env.EARNINGS_PROVIDER;
  const originalApiKey = process.env.QVERIS_API_KEY;
  const originalDemo = process.env.ALLOW_DEMO_DATA;
  t.after(() => {
    restoreEnv("EARNINGS_PROVIDER", originalProvider);
    restoreEnv("QVERIS_API_KEY", originalApiKey);
    restoreEnv("ALLOW_DEMO_DATA", originalDemo);
    __setD1ForTests(undefined);
  });
  process.env.EARNINGS_PROVIDER = "qveris";
  delete process.env.QVERIS_API_KEY;
  delete process.env.ALLOW_DEMO_DATA;

  const res = await POST(jsonRequest({ ticker: "NOPE", mode: "auto", includeAiSummary: false }));
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, { error: "EARNINGS_DATA_UNAVAILABLE" });
  assert.doesNotMatch(JSON.stringify(body), /QVeris|API key|configured/i);
});

test("analyze route hides non-whitelisted 500 errors", async () => {
  const res = await POST(new Request("http://localhost/api/earnings/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "INTERNAL_ERROR" });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/earnings/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
