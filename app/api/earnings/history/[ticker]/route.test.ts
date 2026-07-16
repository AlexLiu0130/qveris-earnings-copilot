import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/app/api/earnings/history/[ticker]/route";
import { __clearAnalysisStoreForTests, saveAnalysis } from "@/lib/earnings/analysisStore";
import { __setD1ForTests } from "@/lib/storage/d1";
import { sampleAnalysis } from "@/app/api/earnings/_testAnalysis";

test("history route reports stored analysis cache hits", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  t.after(() => __setD1ForTests(undefined));

  await saveAnalysis({ ticker: "NVDA", mode: "auto" }, sampleAnalysis());

  const res = await GET(new Request("http://localhost/api/earnings/history/NVDA?limit=4"), {
    params: Promise.resolve({ ticker: "NVDA" }),
  });
  const body = await res.json() as {
    cache?: { hit?: boolean };
    quarters?: unknown[];
    limitedHistory?: boolean;
    sources?: unknown[];
    missing?: string[];
    capabilityStatus?: { historicalSnapshots?: string; sourceRefs?: string };
    confidence?: { label?: string };
  };
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-QVeris-History-Cache"), "HIT");
  assert.equal(body.cache?.hit, true);
  assert.equal(body.quarters?.length, 1);
  assert.equal(body.limitedHistory, true);
  assert.deepEqual(body.sources, sampleAnalysis().sources);
  assert.ok(body.missing?.includes("historicalSnapshots:insufficient"));
  assert.equal(body.capabilityStatus?.historicalSnapshots, "partial");
  assert.equal(body.capabilityStatus?.sourceRefs, "available");
  assert.equal(body.confidence?.label, "medium");
});

test("history route reports empty stores as unavailable history", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  t.after(() => __setD1ForTests(undefined));

  const res = await GET(new Request("http://localhost/api/earnings/history/NVDA?limit=4"), {
    params: Promise.resolve({ ticker: "NVDA" }),
  });
  const body = await res.json() as {
    cache?: { hit?: boolean };
    quarters?: unknown[];
    limitedHistory?: boolean;
    sources?: unknown[];
    missing?: string[];
    capabilityStatus?: { historicalSnapshots?: string };
    confidence?: { label?: string };
  };
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-QVeris-History-Cache"), "MISS");
  assert.equal(body.cache?.hit, false);
  assert.deepEqual(body.quarters, []);
  assert.deepEqual(body.sources, []);
  assert.equal(body.limitedHistory, true);
  assert.ok(body.missing?.includes("historicalSnapshots:insufficient"));
  assert.equal(body.capabilityStatus?.historicalSnapshots, "unavailable");
  assert.equal(body.confidence?.label, "low");
});

test("history route reports missing source refs without marking history unavailable", async (t) => {
  __clearAnalysisStoreForTests();
  __setD1ForTests(null);
  t.after(() => __setD1ForTests(undefined));

  await saveAnalysis({ ticker: "NVDA", mode: "auto" }, sampleAnalysis({
    results: {
      ticker: "NVDA",
      eventId: "evt-nvda-2026q1",
      revenueActual: 110,
      epsActual: 2.2,
      sourceIds: ["missing-src"],
    },
  }));

  const res = await GET(new Request("http://localhost/api/earnings/history/NVDA?limit=4"), {
    params: Promise.resolve({ ticker: "NVDA" }),
  });
  const body = await res.json() as {
    sources?: Array<{ id?: string }>;
    missing?: string[];
    capabilityStatus?: { historicalSnapshots?: string; sourceRefs?: string };
    confidence?: { label?: string };
  };
  assert.equal(res.status, 200);
  assert.deepEqual(body.sources?.map((source) => source.id), ["src-1"]);
  assert.ok(body.missing?.includes("source:missing-src"));
  assert.equal(body.capabilityStatus?.historicalSnapshots, "partial");
  assert.equal(body.capabilityStatus?.sourceRefs, "partial");
  assert.equal(body.confidence?.label, "low");
});

test("history route rejects invalid limits", async () => {
  const res = await GET(new Request("http://localhost/api/earnings/history/NVDA?limit=99"), {
    params: Promise.resolve({ ticker: "NVDA" }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-QVeris-History-Cache"), "MISS");
  assert.deepEqual(await res.json(), { error: "INVALID_REQUEST" });
});
