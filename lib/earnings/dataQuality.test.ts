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
    estimates: { ticker: "PEP", revenueEstimate: 100, epsEstimate: 2, sourceIds: ["estimates"] },
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

test("estimate selection uses the event fiscal quarter identity", () => {
  const event = {
    id: "MU-2026-06-24",
    ticker: "MU",
    fiscalPeriod: "Q3",
    fiscalYear: 2026,
    reportDate: "2026-06-24",
    timing: "after_close" as const,
    status: "reported" as const,
    sourceIds: ["calendar"],
  };
  const selected = selectEstimate([
    { horizon: "quarterly", fiscalYear: 2026, fiscalPeriod: "Q4", eps_estimate_average: 34.8 },
    { horizon: "quarterly", fiscalYear: 2026, fiscalPeriod: "Q3", eps_estimate_average: 20.3 },
  ], event);
  assert.equal(selected?.eps_estimate_average, 20.3);
  assert.equal(selectEstimate([
    { horizon: "quarterly", fiscalYear: 2026, fiscalPeriod: "Q2", eps_estimate_average: 31.3 },
  ], event), null);
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

test("same-event earnings history supplies a missing EPS estimate", () => {
  const event = {
    id: "ASML-2026-07-15",
    ticker: "ASML",
    fiscalPeriod: "Q2",
    fiscalYear: 2026,
    reportDate: "2026-07-15",
    timing: "unknown" as const,
    status: "reported" as const,
    sourceIds: ["calendar"],
  };
  const estimates = resolveEventEstimates(event, null, [{
    eventId: "ASML-earnings-2026-06-30",
    fiscalPeriod: "2026-06-30",
    reportDate: "2026-07-15",
    epsActual: 7.58,
    epsEstimate: 7.98,
    sourceIds: ["history"],
  }]);

  assert.equal(estimates?.epsEstimate, 7.98);
  assert.deepEqual(estimates?.fieldSourceIds?.epsEstimate, ["history"]);
});

test("small estimate rounding differences are not reported as conflicts", () => {
  const event = {
    id: "NVDA-2026-08-26",
    ticker: "NVDA",
    fiscalPeriod: "Q2",
    fiscalYear: 2026,
    reportDate: "2026-08-26",
    timing: "after_close" as const,
    status: "upcoming" as const,
    revenueEstimate: 1000,
    epsEstimate: 2,
    sourceIds: ["event-source"],
  };

  assert.deepEqual(detectDataConflicts({
    event,
    estimates: {
      ticker: "NVDA",
      eventId: event.id,
      revenueEstimate: 1004,
      epsEstimate: 2.009,
      sourceIds: ["provider-source"],
    },
    results: null,
    financials: [],
  }), []);
});

test("event-resolved estimates do not report provider trend mismatch as a conflict", () => {
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
  const providerTrend = {
    ticker: "MU",
    eventId: event.id,
    revenueEstimate: 35_251_836_320,
    epsEstimate: 20.2843,
    estimateCount: 31,
    sourceIds: ["provider-estimate-trend"],
  };
  const resolved = resolveEventEstimates(event, providerTrend);

  assert.deepEqual(detectDataConflicts({
    event,
    estimates: resolved,
    results: null,
    financials: [],
  }), []);

  assert.equal(resolved?.revenueEstimate, event.revenueEstimate);
  assert.equal(resolved?.epsEstimate, event.epsEstimate);
  assert.equal(resolved?.estimateCount, 31);
  assert.deepEqual(resolved?.fieldSourceIds?.revenueEstimate, ["calendar"]);
  assert.deepEqual(resolved?.fieldSourceIds?.epsEstimate, ["calendar"]);
  assert.deepEqual(resolved?.sourceIds, ["calendar", "provider-estimate-trend"]);
});

test("same-period actual financial statement conflict is still reported", () => {
  const conflicts = detectDataConflicts({
    event: {
      id: "MU-2026-06-24",
      ticker: "MU",
      fiscalPeriod: "Q3",
      fiscalYear: 2026,
      reportDate: "2026-06-24",
      timing: "after_close",
      status: "reported",
      sourceIds: ["calendar"],
    },
    estimates: null,
    results: { ticker: "MU", revenueActual: 41_456_000_000, sourceIds: ["calendar"] },
    financials: [{ date: "2026-05-31", fiscalYear: 2026, period: "Q3", revenue: 35_000_000_000, sourceIds: ["statement"] }],
  });

  assert.deepEqual(conflicts, ["Reported revenue differs materially from the matching quarterly financial statement."]);
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

test("event period selection requires fiscal year and quarter identity", () => {
  const rows = [
    { fiscalYear: 2026, period: "Q3", value: 1 },
    { fiscalYear: 2026, period: "Q2", value: 2 },
  ];
  const event = {
    id: "MU-2026-06-24",
    ticker: "MU",
    reportDate: "2026-06-24",
    timing: "after_close" as const,
    status: "reported" as const,
    sourceIds: ["calendar"],
  };

  assert.equal(selectFiscalPeriod(rows, { ...event, fiscalYear: 2026 }), undefined);
  assert.equal(selectFiscalPeriod(rows, { ...event, fiscalPeriod: "Q3" }), undefined);
  assert.equal(selectFiscalPeriod(rows, event), undefined);
  assert.deepEqual(selectFiscalPeriod(rows, { ...event, fiscalYear: 2026, fiscalPeriod: "Q3" }), rows[0]);
});

test("conflict detection does not compare actuals against unidentified statement rows", () => {
  const conflicts = detectDataConflicts({
    event: {
      id: "NKE-2026-06-25",
      ticker: "NKE",
      fiscalPeriod: "Q4",
      fiscalYear: 2026,
      reportDate: "2026-06-25",
      timing: "after_close",
      status: "reported",
      sourceIds: ["calendar"],
    },
    estimates: null,
    results: { ticker: "NKE", revenueActual: 10, sourceIds: ["results"] },
    financials: [{ date: "2026-05-31", revenue: 40, sourceIds: ["statement"] }],
  });

  assert.deepEqual(conflicts, []);
});

test("prepared remarks yield numeric management guidance", () => {
  const text = extractGuidanceText([{ content:
    "Now turning to guidance: we expect fiscal Q4 revenue to be $50 billion, plus or minus $1 billion; gross margin to be approximately 86%. Based on 1.15 billion shares, we expect EPS to be $31, plus or minus $1. We expect cash flow to increase." }]);
  assert.match(text ?? "", /\$50 billion/);
  assert.match(text ?? "", /EPS to be \$31/);
  assert.doesNotMatch(text ?? "", /cash flow/);
});
