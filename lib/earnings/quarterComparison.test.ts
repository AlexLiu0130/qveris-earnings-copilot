import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MultiQuarterPanel } from "@/components/earnings/MultiQuarterPanel";
import { buildQuarterComparison } from "@/lib/earnings/quarterComparison";
import type { EarningsAnalysis } from "@/lib/earnings/types";

test("dedupes matching quarters across snapshots with newer snapshot priority", () => {
  const rows = buildQuarterComparison([
    analysis("old", "2026-07-01T00:00:00.000Z", {
      event: event("NVDA-2026-q2", "Q2", 2026, "2026-07-20"),
      results: { ticker: "NVDA", revenueActual: 90, epsActual: 1.8, sourceIds: ["old-results"] },
      estimates: { ticker: "NVDA", revenueEstimate: 100, epsEstimate: 2, sourceIds: ["old-estimates"] },
    }),
    analysis("new", "2026-07-02T00:00:00.000Z", {
      event: event("NVDA-2026-q2", "Q2", 2026, "2026-07-20"),
      results: { ticker: "NVDA", revenueActual: 110, epsActual: 2.2, sourceIds: ["new-results"] },
      estimates: { ticker: "NVDA", revenueEstimate: 100, epsEstimate: 2, sourceIds: ["new-estimates"] },
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].analysisId, "new");
  assert.equal(rows[0].revenueActual, 110);
  assert.equal(rows[0].epsActual, 2.2);
});

test("merges only explicit date or fiscal-period matches", () => {
  const rows = buildQuarterComparison([analysis("a1", "2026-07-02T00:00:00.000Z", {
    historicalPattern: [
      { eventId: "hist-date", fiscalPeriod: "2026-03-31", reportDate: "2026-04-25", epsActual: 1.4, sourceIds: ["hist"] },
      { eventId: "hist-q-only", fiscalPeriod: "Q1", reportDate: "2025-04-25", epsActual: 1.1, sourceIds: ["hist-old"] },
    ],
    financials: [
      { date: "2026-03-31", fiscalYear: 2026, period: "Q1", revenue: 120, grossMargin: 0.55, sourceIds: ["fin"] },
    ],
  })], 8);

  const merged = rows.find((row) => row.eventKey === "hist-date");
  assert.equal(merged?.revenueActual, 120);
  assert.equal(merged?.grossMargin, 0.55);
  assert.equal(rows.some((row) => row.eventKey === "hist-q-only"), true);
});

test("does not merge same report date when fiscal identity differs", () => {
  const rows = buildQuarterComparison([
    analysis("q1", "2026-07-02T00:00:00.000Z", {
      event: event("NVDA-q1-same-day", "Q1", 2026, "2026-08-26"),
      results: { ticker: "NVDA", revenueActual: 90, sourceIds: ["q1"] },
    }),
    analysis("q2", "2026-07-01T00:00:00.000Z", {
      event: event("NVDA-q2-same-day", "Q2", 2026, "2026-08-26"),
      results: { ticker: "NVDA", revenueActual: 110, sourceIds: ["q2"] },
    }),
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.eventKey).sort(), ["NVDA-q1-same-day", "NVDA-q2-same-day"]);
});

test("merges MU same report date when Q label and fiscal end date identify the same quarter", () => {
  const rows = buildQuarterComparison([analysis("mu", "2026-07-02T00:00:00.000Z", {
    historicalPattern: [
      { eventId: "MU-2026-06-24-q3", fiscalPeriod: "Q3", reportDate: "2026-06-24", revenueActual: 9370, sourceIds: ["q3"] },
      { eventId: "MU-2026-06-24-end", fiscalPeriod: "2026-05-31", reportDate: "2026-06-24", epsActual: 1.91, sourceIds: ["end"] },
    ],
  })]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].eventKey, "MU-2026-06-24-q3");
  assert.equal(rows[0].fiscalPeriod, "Q3");
  assert.equal(rows[0].revenueActual, 9370);
  assert.equal(rows[0].epsActual, 1.91);
  assert.deepEqual(rows[0].sourceIds, ["q3", "end"]);
});

test("does not merge same report date Q label and fiscal end date when fiscal years conflict", () => {
  const rows = buildQuarterComparison([
    analysis("q3", "2026-07-02T00:00:00.000Z", {
      event: event("MU-q3-fy2025", "Q3", 2025, "2026-06-24"),
    }),
    analysis("end", "2026-07-01T00:00:00.000Z", {
      event: event("MU-end-fy2026", "2026-05-31", 2026, "2026-06-24"),
    }),
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.eventKey).sort(), ["MU-end-fy2026", "MU-q3-fy2025"]);
});

test("uses report date only when both rows lack fiscal identity", () => {
  const rows = buildQuarterComparison([analysis("a1", "2026-07-02T00:00:00.000Z", {
    historicalPattern: [
      { eventId: "same-report-new", reportDate: "2026-04-25", revenueActual: 100, sourceIds: ["new"] },
      { eventId: "same-report-old", reportDate: "2026-04-25", epsActual: 1.1, sourceIds: ["old"] },
    ],
  })]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].eventKey, "same-report-new");
  assert.equal(rows[0].revenueActual, 100);
  assert.equal(rows[0].epsActual, 1.1);
});

test("keeps missing fields unavailable instead of fabricating values", () => {
  const [row] = buildQuarterComparison([analysis("a1", "2026-07-02T00:00:00.000Z", {
    historicalPattern: [{ eventId: "hist", fiscalPeriod: "2026-03-31", reportDate: "2026-04-25", epsActual: 1.4, sourceIds: ["hist"] }],
  })]);

  assert.equal(row.revenueActual, undefined);
  assert.equal(row.epsEstimate, undefined);
  assert.equal(row.epsSurprisePct, undefined);
});

test("keeps field sources scoped when only EPS has a source", () => {
  const [row] = buildQuarterComparison([analysis("a1", "2026-07-02T00:00:00.000Z", {
    event: event("NVDA-2026-q2", "Q2", 2026, "2026-07-20"),
    results: {
      ticker: "NVDA",
      revenueActual: 100,
      epsActual: 2,
      sourceIds: ["results"],
      fieldSourceIds: { epsActual: ["eps-src"] },
    },
  })]);

  assert.equal(row.revenueActual, 100);
  assert.equal(row.fieldSourceIds.revenueActual, undefined);
  assert.deepEqual(row.fieldSourceIds.epsActual, ["eps-src"]);

  const html = renderToStaticMarkup(React.createElement(MultiQuarterPanel, {
    rows: [row],
    sources: [{ id: "eps-src", title: "EPS source", retrievedAt: "2026-07-08T00:00:00Z" }],
    language: "en",
  }));
  assert.match(html, /actual: unavailable/);
  assert.match(html, /\$2\.00<sup class="cite">\[1\]<\/sup>/);
});

test("calculates surprise percentages", () => {
  const [row] = buildQuarterComparison([analysis("a1", "2026-07-02T00:00:00.000Z", {
    historicalPattern: [{
      eventId: "hist",
      fiscalPeriod: "2026-03-31",
      reportDate: "2026-04-25",
      revenueActual: 110,
      revenueEstimate: 100,
      epsActual: 1.8,
      epsEstimate: 2,
      sourceIds: ["hist"],
    }],
  })]);

  assert.equal(row.revenueSurprisePct, 10);
  assert.equal(row.epsSurprisePct?.toFixed(1), "-10.0");
});

test("sorts by report date descending and applies limit up to 12", () => {
  const rows = buildQuarterComparison([analysis("a1", "2026-07-02T00:00:00.000Z", {
    historicalPattern: [
      { eventId: "q1", reportDate: "2026-01-01", sourceIds: ["s"] },
      { eventId: "q3", reportDate: "2026-03-01", sourceIds: ["s"] },
      { eventId: "q2", reportDate: "2026-02-01", sourceIds: ["s"] },
    ],
  })], 2);

  assert.deepEqual(rows.map((row) => row.eventKey), ["q3", "q2"]);
});

function event(id: string, fiscalPeriod: string, fiscalYear: number, reportDate: string) {
  return {
    id,
    ticker: "NVDA",
    fiscalPeriod,
    fiscalYear,
    reportDate,
    timing: "after_close" as const,
    status: "reported" as const,
    sourceIds: ["event"],
  };
}

function analysis(
  analysisId: string,
  generatedAt: string,
  overrides: Partial<EarningsAnalysis> = {},
): EarningsAnalysis {
  return {
    analysisId,
    ticker: "NVDA",
    language: "en",
    mode: "combined",
    company: null,
    event: null,
    upcomingEvent: null,
    recentEvent: null,
    estimates: null,
    results: null,
    quote: null,
    marketReaction: null,
    financials: [],
    segmentRevenue: [],
    historicalPattern: [],
    historicalSummary: {
      revenueBeatCount: 0,
      epsBeatCount: 0,
      revenueDataPoints: 0,
      epsDataPoints: 0,
      quarters: 0,
      limitedHistory: true,
    },
    news: [],
    filings: [],
    transcript: null,
    analystRevisions: [],
    oneLineVerdict: "",
    eventStatus: [],
    whatChanged: [],
    keyQuestions: [],
    keyDrivers: [],
    riskSignals: [],
    qualityOfEarnings: [],
    summaryBullets: [],
    watchNext: [],
    confidence: { label: "low", reason: "" },
    caveats: [],
    capabilityStatus: {},
    missing: [],
    conflicts: [],
    sources: [],
    generatedAt,
    ...overrides,
  };
}
