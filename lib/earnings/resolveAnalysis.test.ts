import assert from "node:assert/strict";
import test from "node:test";
import { sampleAnalysis } from "@/app/api/earnings/_testAnalysis";
import { resolveAnalysis } from "@/lib/earnings/resolveAnalysis";
import type { AnalyzeEarningsRequest, EarningsAnalysis } from "@/lib/earnings/types";

const request = {
  ticker: "NVDA",
  mode: "auto",
  language: "en",
  includeSources: true,
  includeHistoricalPattern: true,
  includeNews: true,
  includeFilings: true,
  includeTranscript: true,
} as const;

test("uses matching analysis id before request cache", async () => {
  const calls: string[] = [];
  const stored = sampleAnalysis({ analysisId: "stored", ticker: "nvda" });

  const analysis = await resolveAnalysis(request, " stored ", deps(calls, { byId: stored }));

  assert.equal(analysis.analysisId, "stored");
  assert.deepEqual(calls, ["id:stored"]);
});

test("uses explicit historical snapshot even when request language changed", async () => {
  const calls: string[] = [];
  const stored = sampleAnalysis({ analysisId: "stored-zh", language: "zh" });

  const analysis = await resolveAnalysis(request, "stored-zh", deps(calls, { byId: stored }));

  assert.equal(analysis.language, "zh");
  assert.deepEqual(calls, ["id:stored-zh"]);
});

test("ignores mismatched analysis id and uses request cache", async () => {
  const calls: string[] = [];
  const cached = sampleAnalysis({ analysisId: "cached" });

  const analysis = await resolveAnalysis(
    request,
    "wrong-ticker",
    deps(calls, {
      byId: sampleAnalysis({ analysisId: "wrong-ticker", ticker: "MSFT" }),
      cached,
    }),
  );

  assert.equal(analysis.analysisId, "cached");
  assert.deepEqual(calls, ["id:wrong-ticker", "cache"]);
});

test("analyzes and saves only after id and request cache miss", async () => {
  const calls: string[] = [];
  const fresh = sampleAnalysis({ analysisId: "fresh" });

  const analysis = await resolveAnalysis(request, undefined, deps(calls, { fresh }));

  assert.equal(analysis.analysisId, "fresh");
  assert.deepEqual(calls, ["cache", "analyze", "save:fresh"]);
});

function deps(
  calls: string[],
  options: {
    byId?: EarningsAnalysis | null;
    cached?: EarningsAnalysis | null;
    fresh?: EarningsAnalysis;
  },
) {
  return {
    async getAnalysisById(analysisId: string) {
      calls.push(`id:${analysisId}`);
      return options.byId ?? null;
    },
    async getCachedAnalysis(_request: AnalyzeEarningsRequest) {
      calls.push("cache");
      return options.cached ?? null;
    },
    async analyzeEarnings(_request: AnalyzeEarningsRequest) {
      calls.push("analyze");
      return options.fresh ?? sampleAnalysis({ analysisId: "fresh" });
    },
    async saveAnalysis(_request: AnalyzeEarningsRequest, analysis: EarningsAnalysis) {
      calls.push(`save:${analysis.analysisId}`);
    },
  };
}
