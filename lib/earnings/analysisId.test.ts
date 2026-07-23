import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisId, requestKey } from "@/lib/earnings/analysisId";

test("analysis ids are unique for the same ticker and mode in the same second", () => {
  const ids = [
    buildAnalysisId({ ticker: "$nvda", mode: "combined", generatedAt: "2026-01-15T12:00:00.001Z" }),
    buildAnalysisId({ ticker: "NVDA", mode: "combined", generatedAt: "2026-01-15T12:00:00.001Z" }),
    buildAnalysisId({ ticker: "NVDA", mode: "combined", generatedAt: "2026-01-15T12:00:00.999Z" }),
  ];

  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^NVDA-combined-20260115T120000Z-[0-9a-z]+$/);
});

test("analysis ids do not reuse a same-second base after many other timestamp bases", () => {
  const input = { ticker: "NVDA", mode: "combined" as const, generatedAt: "2026-01-15T12:00:00.001Z" };
  const first = buildAnalysisId(input);

  for (let i = 0; i < 5000; i += 1) {
    buildAnalysisId({
      ticker: `T${i}`,
      mode: "combined",
      generatedAt: new Date(Date.UTC(2026, 0, 15, 12, 0, i)).toISOString(),
    });
  }

  const next = buildAnalysisId(input);
  assert.notEqual(next, first);
  assert.match(next, /^NVDA-combined-20260115T120000Z-[0-9a-z]+$/);
});

test("request cache keys include the analysis pipeline version", () => {
  assert.equal(JSON.parse(requestKey({ ticker: "JPM" })).analysisPipelineVersion, 11);
});
