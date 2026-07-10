import assert from "node:assert/strict";
import test from "node:test";
import { detectDataConflicts, filterRelevantNews, resolveEventEstimates, selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import {
  extractGuidanceText,
  selectEstimate,
  transcriptPeriod,
} from "@/lib/capabilities/QVerisCapabilityProvider";
import { computeBeatMiss } from "@/lib/earnings/computeBeatMiss";

test("news relevance rejects unrelated aggregation results", () => {
  const sourceIds = ["news"];
  const filtered = filterRelevantNews("PEP", "PepsiCo Inc", [
    { id: "1", title: "PepsiCo reports quarterly results", sourceIds },
    { id: "2", title: "Dianthus starts Phase 3 trial", sourceIds },
    { id: "3", title: "PEP shares move after earnings", sourceIds },
  ]);
  assert.deepEqual(filtered.map((item) => item.id), ["1", "3"]);
});

test("data conflicts compare actuals only with the matching fiscal period", () => {
  const conflicts = detectDataConflicts({
    event: {
      id: "PEP-2026-07-09",
      ticker: "PEP",
      fiscalPeriod: "Q2",
      fiscalYear: 2026,
      reportDate: "2026-07-09",
      timing: "before_open",
      status: "reported",
      revenueEstimate: 100,
      epsEstimate: 2,
      sourceIds: ["calendar"],
    },
    estimates: { ticker: "PEP", revenueEstimate: 120, epsEstimate: 2.5, sourceIds: ["estimates"] },
    results: { ticker: "PEP", revenueActual: 90, sourceIds: ["results"] },
    financials: [{ date: "2026-03-31", fiscalYear: 2026, period: "Q1", revenue: 80, sourceIds: ["financials"] }],
  });
  assert.deepEqual(conflicts, ["The latest financial statement does not match the earnings event fiscal quarter."]);
});

test("transcript period comes from the resolved earnings event", () => {
  assert.deepEqual(transcriptPeriod({
    id: "PEP-2026-07-09",
    ticker: "PEP",
    fiscalPeriod: "Q2",
    fiscalYear: 2026,
    reportDate: "2026-07-09",
    timing: "before_open",
    status: "reported",
    sourceIds: ["calendar"],
  }), { year: "2026", quarter: "2" });
  assert.equal(transcriptPeriod(null), null);
});

test("estimate selection uses the latest fiscal period before the report date", () => {
  const selected = selectEstimate([
    { horizon: "quarterly", date: "2026-11-30", eps_estimate_average: 34.8 },
    { horizon: "quarterly", date: "2026-08-31", eps_estimate_average: 31.3 },
    { horizon: "quarterly", date: "2026-05-31", eps_estimate_average: 20.3 },
  ], "MU-2026-06-24");
  assert.equal(selected?.date, "2026-05-31");
});

test("MU surprise uses the same-event calendar pair", () => {
  const event = {
    id: "MU-2026-06-24",
    ticker: "MU",
    fiscalPeriod: "Q3",
    fiscalYear: 2026,
    reportDate: "2026-06-24",
    timing: "after_close" as const,
    status: "reported" as const,
    revenueEstimate: 36_923_508_824,
    epsEstimate: 21.4019,
    sourceIds: ["calendar"],
  };
  const estimates = resolveEventEstimates(event, {
    ticker: "MU",
    revenueEstimate: 56_612_509_380,
    epsEstimate: 34.7969,
    sourceIds: ["future-quarter-estimates"],
  });
  const verdict = computeBeatMiss({
    ticker: "MU",
    revenueActual: 41_456_000_000,
    epsActual: 25.11,
    sourceIds: ["calendar"],
  }, estimates);
  assert.equal(estimates?.revenueEstimate, event.revenueEstimate);
  assert.equal(estimates?.epsEstimate, event.epsEstimate);
  assert.deepEqual({ revenue: verdict.revenue, eps: verdict.eps }, { revenue: "beat", eps: "beat" });
});

test("period selection never relabels an older quarter", () => {
  const selected = selectFiscalPeriod([
    { fiscalYear: 2026, period: "Q2", value: 1 },
  ], {
    id: "MU-2026-06-24",
    ticker: "MU",
    fiscalPeriod: "Q3",
    fiscalYear: 2026,
    reportDate: "2026-06-24",
    timing: "after_close",
    status: "reported",
    sourceIds: ["calendar"],
  });
  assert.equal(selected, undefined);
});

test("prepared remarks yield numeric management guidance", () => {
  const text = extractGuidanceText([{ content:
    "Now turning to guidance: we expect fiscal Q4 revenue to be $50 billion, plus or minus $1 billion; gross margin to be approximately 86%. Based on 1.15 billion shares, we expect EPS to be $31, plus or minus $1. We expect cash flow to increase." }]);
  assert.match(text ?? "", /\$50 billion/);
  assert.match(text ?? "", /EPS to be \$31/);
  assert.doesNotMatch(text ?? "", /cash flow/);
});
