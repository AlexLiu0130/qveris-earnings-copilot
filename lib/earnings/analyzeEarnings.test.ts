import assert from "node:assert/strict";
import test from "node:test";
import { MockEarningsCapabilityProvider } from "@/lib/capabilities/MockEarningsCapabilityProvider";
import { mockSources } from "@/lib/capabilities/mockData";
import { QVerisCapabilityError } from "@/lib/capabilities/QVerisCapabilityProvider";
import { analyzeEarnings, toAnalyzeResponse } from "@/lib/earnings/analyzeEarnings";
import { getEarningsCalendar } from "@/lib/earnings/calendar";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import type { EarningsCalendarParams, EarningsEvent, FilingItem } from "@/lib/earnings/types";

test("mock analysis returns source-aware combined payload", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new DatedMockProvider(),
  );
  assert.equal(analysis.ticker, "NVDA");
  assert.equal(analysis.mode, "combined");
  assert.ok(analysis.analysisId.startsWith("NVDA-combined-"));
  assert.ok(analysis.sources.length >= 3);
  assert.equal(analysis.capabilityStatus.transcript, "demo");
  assert.equal(analysis.demo, true);
});

test("analysis reports missing source refs without synthesizing placeholders or marking data unavailable", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new MissingEstimateSourceRefProvider(),
  );

  assert.equal(analysis.sources.some((source) => source.id === "NVDA-demo-estimates"), false);
  assert.equal(analysis.issues?.some((issue) => issue.capability === "sourceAudit" && issue.code === "SOURCE_REF_MISSING" && issue.toolId === "NVDA-demo-estimates"), true);
  assert.ok(analysis.missing.includes("source:NVDA-demo-estimates"));
  assert.equal(analysis.capabilityStatus.estimates, "demo");
  assert.equal(analysis.confidence.label, "low");
});

test("AI narrative is ignored when source ids are missing or outside analysis sources", async () => {
  const oldApiKey = process.env.OPENAI_API_KEY;
  const oldBaseUrl = process.env.OPENAI_BASE_URL;
  const oldFetch = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://ai.test";
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summaryBullets: [
              { text: "AI unsupported claim.", sourceIds: ["not-in-analysis"] },
              { text: "AI fake claim with valid source.", sourceIds: ["NVDA-demo-calendar"] },
            ],
            keyDrivers: [{ text: "AI uncited driver.", sourceIds: [] }],
          }),
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });

    const analysis = await analyzeEarnings(
      { ticker: "NVDA", mode: "auto", includeTranscript: true },
      new DatedMockProvider(),
    );

    assert.equal(analysis.summaryBullets.includes("AI unsupported claim."), false);
    assert.equal(analysis.summaryBullets.includes("AI fake claim with valid source."), false);
    assert.equal(analysis.keyDrivers.includes("AI uncited driver."), false);
  } finally {
    if (oldApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldApiKey;
    if (oldBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = oldBaseUrl;
    globalThis.fetch = oldFetch;
  }
});

test("AI narrative may only reorder or filter deterministic claims with matching sources", async () => {
  const baseline = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new DatedMockProvider(),
  );
  const sourcedIndex = baseline.claimSourceIds!.summaryBullets.findIndex(Array.isArray);
  assert.notEqual(sourcedIndex, -1);
  const text = baseline.summaryBullets[sourcedIndex];
  const sourceId = (baseline.claimSourceIds!.summaryBullets[sourcedIndex] as string[])[0];

  const oldApiKey = process.env.OPENAI_API_KEY;
  const oldBaseUrl = process.env.OPENAI_BASE_URL;
  const oldFetch = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://ai.test";
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summaryBullets: [{ text, sourceIds: [sourceId] }],
          }),
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });

    const analysis = await analyzeEarnings(
      { ticker: "NVDA", mode: "auto", includeTranscript: true },
      new DatedMockProvider(),
    );

    assert.deepEqual(analysis.summaryBullets, [text]);
    assert.deepEqual(analysis.claimSourceIds?.summaryBullets, [[sourceId]]);
  } finally {
    if (oldApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldApiKey;
    if (oldBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = oldBaseUrl;
    globalThis.fetch = oldFetch;
  }
});

test("deterministic claims carry only source ids present in analysis sources or unavailable", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new DatedMockProvider(),
  );
  const known = new Set(analysis.sources.map((source) => source.id));
  assert.ok(analysis.claimSourceIds);
  const claimSourceIds = analysis.claimSourceIds;

  assert.equal(claimSourceIds.summaryBullets.length, analysis.summaryBullets.length);
  assert.equal(claimSourceIds.keyDrivers.length, analysis.keyDrivers.length);
  assert.equal(claimSourceIds.riskSignals.length, analysis.riskSignals.length);
  assert.equal(claimSourceIds.qualityOfEarnings.length, analysis.qualityOfEarnings.length);
  assert.equal(claimSourceIds.watchNext.length, analysis.watchNext.length);
  assert.deepEqual(claimSourceIds.oneLineVerdict, claimSourceIds.summaryBullets[0]);
  for (const ids of [
    claimSourceIds.oneLineVerdict,
    ...claimSourceIds.summaryBullets,
    ...claimSourceIds.keyDrivers,
    ...claimSourceIds.riskSignals,
    ...claimSourceIds.qualityOfEarnings,
    ...claimSourceIds.watchNext,
  ]) {
    if (ids === "unavailable") continue;
    assert.ok(ids.length > 0);
    assert.ok(ids.every((id) => known.has(id)));
  }
});

test("mock analysis keeps transcript absence explicit", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "TSLA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new MockEarningsCapabilityProvider(),
  );
  assert.equal(analysis.transcript?.available, false);
  assert.equal(analysis.capabilityStatus.transcript, "unavailable");
  assert.ok(analysis.missing.includes("transcript"));
});

test("mock analysis follows Chinese narrative language", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", language: "zh", includeTranscript: true, includeAiSummary: false },
    new DatedMockProvider(),
  );
  assert.equal(analysis.language, "zh");
  assert.match(analysis.summaryBullets[0], /[\u3400-\u9fff]/);
  assert.match(analysis.keyDrivers[0], /[\u3400-\u9fff]/);
  assert.match(analysis.confidence.reason, /[\u3400-\u9fff]/);
  assert.ok(analysis.transcript?.repeatedQuestions?.every((item) => /[\u3400-\u9fff]/.test(item)));
});

test("calendar distinguishes provider failure from a real empty range", async () => {
  const empty = await getEarningsCalendar({ from: "2099-01-01", to: "2099-01-02" }, new EmptyCalendarProvider());
  assert.deepEqual(empty.events, []);
  assert.deepEqual(empty.issues, []);

  const failed = await getEarningsCalendar({ from: "2099-01-01", to: "2099-01-02" }, new FailingCalendarProvider());
  assert.deepEqual(failed.events, []);
  assert.equal(failed.issues[0]?.code, "EARNINGS_CALENDAR_UNAVAILABLE");
});

test("filings capability failure keeps the rest of analysis and records a safe issue", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", includeTranscript: true, includeAiSummary: false },
    new FailingFilingsProvider(),
  );
  assert.equal(analysis.company?.ticker, "NVDA");
  assert.ok(analysis.news.length > 0);
  assert.deepEqual(analysis.filings, []);
  assert.equal(analysis.capabilityStatus.filings, "unavailable");
  assert.ok(analysis.missing.includes("filings"));
  assert.equal(analysis.issues?.[0]?.capability, "filings");

  const responseText = JSON.stringify(toAnalyzeResponse(analysis));
  assert.doesNotMatch(responseText, /raw provider secret/);
});

test("provider issue with no usable evidence throws data unavailable instead of no-event analysis", async () => {
  await assert.rejects(
    analyzeEarnings({ ticker: "NOPE", mode: "auto", includeAiSummary: false }, new CalendarDownNoDataProvider()),
    /EARNINGS_DATA_UNAVAILABLE/,
  );
});

test("provider issue with partial evidence still returns analysis", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "NVDA", mode: "auto", includeAiSummary: false },
    new FailingCalendarProvider(),
  );
  assert.equal(analysis.ticker, "NVDA");
  assert.equal(analysis.mode, "no_event");
  assert.equal(analysis.issues?.[0]?.code, "EARNINGS_CALENDAR_UNAVAILABLE");
  assert.ok(analysis.sources.length > 0);
});

test("after-close earnings reaction uses the next regular session", async () => {
  const analysis = await analyzeEarnings(
    { ticker: "MU", mode: "auto", includeAiSummary: false },
    new AfterCloseReactionProvider(),
  );

  assert.equal(analysis.event?.timing, "after_close");
  assert.equal(analysis.marketReaction?.basis, "next_session");
  assert.equal(analysis.marketReaction?.baselineSessionDate, analysis.event?.reportDate);
  assert.equal(analysis.marketReaction?.reactionSessionDate, addDaysIso(analysis.event!.reportDate, 1));
  assert.equal(analysis.marketReaction?.closeChangePct, 10);
});

class EmptyCalendarProvider extends MockEarningsCapabilityProvider {
  async getEarningsCalendar(_params: EarningsCalendarParams): Promise<EarningsEvent[]> {
    return [];
  }
}

class DatedMockProvider extends MockEarningsCapabilityProvider {
  getSourceRefs() {
    return mockSources("NVDA");
  }

  async getEarningsCalendar(params: EarningsCalendarParams): Promise<EarningsEvent[]> {
    const ticker = (params.universe ?? "NVDA").toUpperCase();
    const today = todayIso();
    return [
      {
        id: `${ticker}-recent`,
        ticker,
        fiscalPeriod: "Q1",
        fiscalYear: 2026,
        reportDate: addDaysIso(today, -3),
        timing: "after_close",
        status: "reported",
        sourceIds: [`${ticker}-demo-calendar`],
      },
      {
        id: `${ticker}-upcoming`,
        ticker,
        fiscalPeriod: "Q2",
        fiscalYear: 2026,
        reportDate: addDaysIso(today, 5),
        timing: "after_close",
        status: "upcoming",
        sourceIds: [`${ticker}-demo-calendar`],
      },
    ];
  }
}

class MissingEstimateSourceRefProvider extends DatedMockProvider {
  getSourceRefs() {
    return mockSources("NVDA").filter((source) => source.id !== "NVDA-demo-estimates");
  }
}

class AfterCloseReactionProvider extends DatedMockProvider {
  async getHistoricalPrices(_ticker: string) {
    const reportDate = addDaysIso(todayIso(), -3);
    return [
      { date: addDaysIso(reportDate, -1), open: 90, close: 90, volume: undefined, sourceIds: ["prices"] },
      { date: reportDate, open: 100, close: 100, volume: undefined, sourceIds: ["prices"] },
      { date: addDaysIso(reportDate, 1), open: 105, close: 110, volume: undefined, sourceIds: ["prices"] },
    ];
  }
}

class FailingCalendarProvider extends MockEarningsCapabilityProvider {
  async getEarningsCalendar(_params: EarningsCalendarParams): Promise<EarningsEvent[]> {
    throw new QVerisCapabilityError("calendar-tool", "http_error", 503, "raw provider secret calendar failed");
  }
}

class FailingFilingsProvider extends MockEarningsCapabilityProvider {
  async getSecFilings(_ticker: string): Promise<FilingItem[]> {
    throw new QVerisCapabilityError("filings-tool", "business_error", 502, "raw provider secret filing failed");
  }
}

class CalendarDownNoDataProvider extends FailingCalendarProvider {
  async getCompanyProfile() {
    return null;
  }

  async getEarningsEstimates() {
    return null;
  }

  async getHistoricalEarnings() {
    return [];
  }

  async getStockQuote() {
    return null;
  }

  async getFinancialStatements() {
    return [];
  }

  async getRevenueSegments() {
    return [];
  }

  async getFinancialNews() {
    return [];
  }

  async getSecFilings() {
    return [];
  }

  async getAnalystRevisions() {
    return [];
  }
}
