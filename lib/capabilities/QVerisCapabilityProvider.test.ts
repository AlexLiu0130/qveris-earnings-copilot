import assert from "node:assert/strict";
import test from "node:test";
import { __clearQVerisFetchCacheForTests } from "@/lib/capabilities/qverisFetchCache";
import { QVerisCapabilityError, QVerisCapabilityProvider } from "@/lib/capabilities/QVerisCapabilityProvider";
import type { EarningsEvent } from "@/lib/earnings/types";
import { __setD1ForTests } from "@/lib/storage/d1";

type FetchCall = { url: string; body?: Record<string, unknown> };

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function stubFetch(t: test.TestContext, handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  resetCache(t);
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined,
    });
    return handler(url, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function resetCache(t: test.TestContext) {
  __clearQVerisFetchCacheForTests();
  __setD1ForTests(null);
  t.after(() => {
    __clearQVerisFetchCacheForTests();
    __setD1ForTests(undefined);
  });
}

function providerReadFailedResponse() {
  return jsonResponse({
    success: false,
    result: {
      status_code: 200,
      data: {
        error: "第三方服务响应读取失败，请稍后重试",
        reason_code: "provider_response_read_failed",
      },
    },
  });
}

function emptyProviderResponse() {
  return jsonResponse({ success: false, result: { status_code: 200, data: {} } });
}

test("calendar uses current QVeris tool and maps earningsCalendar rows", async (t) => {
  const calls = stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: "calendar-exec",
    result: {
      data: {
        earningsCalendar: [{
          symbol: "NVDA",
          date: "2099-07-20",
          hour: "amc",
          quarter: 2,
          year: 2099,
          epsEstimate: 1.23,
          revenueEstimate: 456,
        }],
      },
    },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const events = await provider.getEarningsCalendar({ from: "2099-07-20", to: "2099-07-20", universe: "NVDA" });

  assert.equal(calls[0].body?.tool_id, "finnhub.calendar.earnings.retrieve.v1.1552775d");
  assert.deepEqual(calls[0].body?.parameters, { from: "2099-07-20", to: "2099-07-20" });
  assert.equal(events.length, 1);
  assert.equal(events[0].ticker, "NVDA");
  assert.equal(events[0].timing, "after_close");
  assert.equal(events[0].epsEstimate, 1.23);
  assert.equal(events[0].revenueEstimate, 456);
});

test("calendar supplements ASML quarterly 6-K from SEC submissions", async (t) => {
  const calls = stubFetch(t, (_url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.tool_id === "sec.company.submissions.v1") {
      return jsonResponse({
        success: true,
        execution_id: "asml-submissions-exec",
        result: { data: { filings: { recent: {
          accessionNumber: ["0001628280-26-048200", "0001628280-26-048235"],
          filingDate: ["2026-07-14", "2026-07-15"],
          reportDate: ["2026-07-14", "2026-06-28"],
          form: ["6-K", "6-K"],
          primaryDocument: ["form6-kunrelated.htm", "form6-kquarterlyfilings.htm"],
        } } } },
      });
    }
    return jsonResponse({ success: true, execution_id: "calendar-exec", result: { data: { earningsCalendar: [] } } });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const events = await provider.getEarningsCalendar({ from: "2026-07-15", to: "2026-07-15", universe: "ASML" });

  assert.equal(calls[1].body?.tool_id, "sec.company.submissions.v1");
  assert.deepEqual(calls[1].body?.parameters, { cik: "0000937966" });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    id: "ASML-2026-07-15",
    ticker: "ASML",
    fiscalPeriod: "Q2",
    fiscalYear: 2026,
    reportDate: "2026-07-15",
    timing: "unknown",
    status: "reported",
    sourceIds: ["ASML-qveris-get_sec_quarterly_filing_0001628280-26-048235"],
  });
  const source = provider.getSourceRefs().find((item) => item.id === events[0].sourceIds[0]);
  assert.equal(source?.executionId, "asml-submissions-exec");
  assert.equal(source?.url, "https://www.sec.gov/Archives/edgar/data/937966/000162828026048235/form6-kquarterlyfilings.htm");
});

test("calendar supplements TSM Q2 2026 from official IR when SEC 6-K is absent", async (t) => {
  const calls = stubFetch(t, (_url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.tool_id === "sec.company.submissions.v1") {
      return jsonResponse({ success: true, execution_id: "tsm-submissions-exec", result: { data: { filings: { recent: {
        filingDate: [],
        reportDate: [],
        form: [],
        primaryDocument: [],
      } } } } });
    }
    return jsonResponse({ success: true, execution_id: "calendar-exec", result: { data: { earningsCalendar: [] } } });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const events = await provider.getEarningsCalendar({ from: "2026-07-16", to: "2026-07-16", universe: "TSM" });
  const source = provider.getSourceRefs().find((item) => item.id === events[0]?.sourceIds[0]);

  assert.equal(calls[1].body?.tool_id, "sec.company.submissions.v1");
  assert.equal(events.length, 1);
  assert.equal(events[0].ticker, "TSM");
  assert.equal(events[0].reportDate, "2026-07-16");
  assert.equal(events[0].fiscalPeriod, "Q2");
  assert.equal(events[0].fiscalYear, 2026);
  assert.equal(events[0].timing, "before_open");
  assert.equal(events[0].status, "reported");
  assert.equal(events[0].epsActual, undefined);
  assert.equal(events[0].revenueActual, undefined);
  assert.equal(source?.provider, "TSMC Investor Relations");
  assert.equal(source?.url, "https://investor.tsmc.com/english/quarterly-results/2026/q2");
});

test("calendar keeps Finnhub event when ADR supplement has the same ticker and date", async (t) => {
  const calls = stubFetch(t, (_url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.tool_id === "sec.company.submissions.v1") {
      return jsonResponse({
        success: true,
        execution_id: "asml-submissions-exec",
        result: { data: { filings: { recent: {
          filingDate: ["2026-07-15"],
          accessionNumber: ["0001628280-26-048235"],
          reportDate: ["2026-06-28"],
          form: ["6-K"],
          primaryDocument: ["asml-20260715-quarterlyfilings.htm"],
        } } } },
      });
    }
    return jsonResponse({
      success: true,
      execution_id: "calendar-exec",
      result: { data: { earningsCalendar: [{
        symbol: "ASML",
        date: "2026-07-15",
        hour: "bmo",
        quarter: 2,
        year: 2026,
        epsActual: 1.2,
        revenueActual: 10,
      }] } },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const events = await provider.getEarningsCalendar({ from: "2026-07-15", to: "2026-07-15", universe: "ASML" });

  assert.equal(calls.length, 2);
  assert.equal(events.length, 1);
  assert.equal(events[0].epsActual, 1.2);
  assert.equal(events[0].revenueActual, 10);
  assert.deepEqual(events[0].sourceIds, ["ASML-qveris-get_earnings_calendar"]);
});

test("calendar does not call ADR supplements for a custom universe without ASML or TSM", async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ success: true, execution_id: "calendar-exec", result: { data: { earningsCalendar: [] } } }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const events = await provider.getEarningsCalendar({ from: "2026-07-15", to: "2026-07-16", universe: "MU" });

  assert.deepEqual(events, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body?.tool_id, "finnhub.calendar.earnings.retrieve.v1.1552775d");
});

test("calendar chunks long ranges with bounded concurrency and keeps early MU event", async (t) => {
  let active = 0;
  let maxActive = 0;
  let firstChunkFailed = false;
  const calls = stubFetch(t, async (_url, init) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, { from?: string; to?: string }> : {};
    const range = body.parameters ?? {};
    if (range.from === "2026-06-16" && !firstChunkFailed) {
      firstChunkFailed = true;
      return providerReadFailedResponse();
    }
    if (range.from === "2026-06-30") {
      return jsonResponse({ success: true, result: { data: { earningsCalendar: [] } } });
    }
    return jsonResponse({
      success: true,
      execution_id: `calendar-${range.from}`,
      result: {
        data: {
          earningsCalendar: range.from === "2026-06-23"
            ? [{
                symbol: "MU",
                date: "2026-06-24",
                hour: "amc",
                quarter: 3,
                year: 2026,
                epsEstimate: 21.4019,
                epsActual: 25.11,
                revenueEstimate: 36_923_508_824,
                revenueActual: 41_456_000_000,
              }]
            : [],
        },
      },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const events = await provider.getEarningsCalendar({ from: "2026-06-16", to: "2026-08-30", universe: "MU" });

  assert.equal(maxActive, 3);
  assert.equal(calls.length, 12);
  assert.deepEqual(calls[0].body?.parameters, { from: "2026-06-16", to: "2026-06-22" });
  assert.ok(calls.every((call) => !("symbol" in (call.body?.parameters as Record<string, unknown>))));
  assert.deepEqual(events.map((event) => event.id), ["MU-2026-06-24"]);
  assert.equal(events[0].epsEstimate, 21.4019);
  assert.equal(events[0].epsActual, 25.11);
  assert.equal(events[0].revenueEstimate, 36_923_508_824);
  assert.equal(events[0].revenueActual, 41_456_000_000);
});

test("earnings history and estimates use current inspected AlphaVantage tool ids", async (t) => {
  const calls = stubFetch(t, () => {
    const toolId = calls.at(-1)?.body?.tool_id;
    if (toolId === "alphavantage.earnings.retrieve.v1.467a92c0") {
      return jsonResponse({
        success: true,
        execution_id: "history-exec",
        result: { data: { quarterlyEarnings: [{ fiscalDateEnding: "2099-06-30", reportedDate: "2099-07-20", reportedEPS: "1.2", estimatedEPS: "1.0" }] } },
      });
    }
    return jsonResponse({
      success: true,
      execution_id: "estimates-exec",
      result: { data: { estimates: [{ horizon: "quarterly", date: "2099-06-30", eps_estimate_average: "1.0", revenue_estimate_average: "100" }] } },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const history = await provider.getHistoricalEarnings("MU");
  assert.equal(history[0].epsActual, 1.2);
  assert.equal(history[0].revenueEstimate, 100);
  assert.deepEqual(history[0].fieldSourceIds?.revenueEstimate, ["MU-qveris-get_earnings_estimates"]);
  assert.equal((await provider.getEarningsEstimates("MU"))?.revenueEstimate, 100);
  assert.equal(calls[0].body?.tool_id, "alphavantage.earnings.retrieve.v1.467a92c0");
  assert.deepEqual(calls[0].body?.parameters, { symbol: "MU", function: "EARNINGS" });
  assert.equal(calls[1].body?.tool_id, "alphavantage.earnings_estimates.retrieve.v1.467a92c0");
  assert.deepEqual(calls[1].body?.parameters, { symbol: "MU", function: "EARNINGS_ESTIMATES" });
});

test("event estimates and historical eps reject wrong fiscal quarter identity", async (t) => {
  stubFetch(t, (_url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.tool_id === "alphavantage.earnings_estimates.retrieve.v1.467a92c0") {
      return jsonResponse({ success: true, result: { data: { estimates: [
        { horizon: "quarterly", date: "2099-06-30", fiscalYear: 2099, fiscalPeriod: "Q2", eps_estimate_average: "9.99", revenue_estimate_average: "999" },
      ] } } });
    }
    if (body.tool_id === "alphavantage.earnings.retrieve.v1.467a92c0") {
      return jsonResponse({ success: true, result: { data: { quarterlyEarnings: [
        { fiscalDateEnding: "2098-06-30", reportedDate: "2099-07-20", reportedEPS: "9.99" },
      ] } } });
    }
    if (body.tool_id === "financialmodelingprep.stable.incomestatement.retrieve.v1.dd6d583f") {
      return jsonResponse({ success: true, result: { data: [
        { date: "2099-06-30", fiscalYear: 2099, period: "Q3", revenue: 100 },
      ] } });
    }
    return jsonResponse({ success: true, result: { data: [] } });
  });

  const event: EarningsEvent = { id: "MU-2099-07-20", ticker: "MU", fiscalPeriod: "Q3", fiscalYear: 2099, reportDate: "2099-07-20", timing: "after_close", status: "reported", sourceIds: ["calendar"] };
  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });

  assert.equal(await provider.getEarningsEstimates("MU", event), null);
  const results = await provider.getEarningsResults("MU", event);
  assert.equal(results?.revenueActual, 100);
  assert.equal(results?.epsActual, undefined);
});

test("event estimate id alone does not select a nearest dated estimate", async (t) => {
  stubFetch(t, () => jsonResponse({
    success: true,
    result: { data: { estimates: [
      { horizon: "quarterly", date: "2099-06-30", eps_estimate_average: "1.23", revenue_estimate_average: "456" },
      { horizon: "quarterly", date: "2099-09-30", eps_estimate_average: "2.34", revenue_estimate_average: "789" },
    ] } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal(await provider.getEarningsEstimates("MU", "MU-2099-07-20"), null);
});

test("event estimates and historical eps accept matching fiscal quarter identity", async (t) => {
  stubFetch(t, (_url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.tool_id === "alphavantage.earnings_estimates.retrieve.v1.467a92c0") {
      return jsonResponse({ success: true, result: { data: { estimates: [
        { horizon: "quarterly", date: "2099-06-30", fiscalYear: 2099, fiscalPeriod: "Q3", eps_estimate_average: "1.23", revenue_estimate_average: "456" },
      ] } } });
    }
    if (body.tool_id === "alphavantage.earnings.retrieve.v1.467a92c0") {
      return jsonResponse({ success: true, result: { data: { quarterlyEarnings: [
        { fiscalDateEnding: "2099-06-30", reportedDate: "2099-07-20", reportedEPS: "1.23" },
      ] } } });
    }
    if (body.tool_id === "financialmodelingprep.stable.incomestatement.retrieve.v1.dd6d583f") {
      return jsonResponse({ success: true, result: { data: [
        { date: "2099-06-30", fiscalYear: 2099, period: "Q3", revenue: 456 },
      ] } });
    }
    return jsonResponse({ success: true, result: { data: [] } });
  });

  const event: EarningsEvent = { id: "MU-2099-07-20", ticker: "MU", fiscalPeriod: "Q3", fiscalYear: 2099, reportDate: "2099-07-20", timing: "after_close", status: "reported", sourceIds: ["calendar"] };
  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });

  const estimates = await provider.getEarningsEstimates("MU", event);
  assert.equal(estimates?.revenueEstimate, 456);
  assert.equal(estimates?.epsEstimate, 1.23);
  const results = await provider.getEarningsResults("MU", event);
  assert.equal(results?.epsActual, 1.23);
});

test("optional segment failure does not discard core earnings results", async (t) => {
  stubFetch(t, (_url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.tool_id === "financialmodelingprep.stable.revenueproductsegmentation.retrieve.v1.8faa287f") {
      return new Response("provider empty response", { status: 502 });
    }
    if (body.tool_id === "alphavantage.earnings.retrieve.v1.467a92c0") {
      return jsonResponse({ success: true, result: { data: { quarterlyEarnings: [
        { fiscalDateEnding: "2026-06-30", reportedDate: "2026-07-15", reportedEPS: "7.58", estimatedEPS: "7.98" },
      ] } } });
    }
    if (body.tool_id === "financialmodelingprep.stable.incomestatement.retrieve.v1.dd6d583f") {
      return jsonResponse({ success: true, result: { data: [
        { date: "2026-06-30", fiscalYear: 2026, period: "Q2", revenue: 9_326_500_000 },
      ] } });
    }
    return jsonResponse({ success: true, result: { data: [] } });
  });

  const event: EarningsEvent = { id: "ASML-2026-07-15", ticker: "ASML", fiscalPeriod: "Q2", fiscalYear: 2026, reportDate: "2026-07-15", timing: "unknown", status: "reported", sourceIds: ["calendar"] };
  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const results = await provider.getEarningsResults("ASML", event);

  assert.equal(results?.revenueActual, 9_326_500_000);
  assert.equal(results?.epsActual, 7.58);
});

test("calendar rejects malformed success payload instead of returning fake empty data", async (t) => {
  stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: "calendar-exec",
    result: { data: { note: "provider changed shape" } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getEarningsCalendar({ from: "2099-07-20", to: "2099-07-20" }),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "business_error");
      assert.match(error.message, /earningsCalendar array/);
      return true;
    },
  );
});

test("financial statements keep only explicit quarterly periods", async (t) => {
  stubFetch(t, (_url, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (body.tool_id === "financialmodelingprep.stable.incomestatement.retrieve.v1.dd6d583f") {
      return jsonResponse({ success: true, result: { data: [
        { date: "2099-12-31", fiscalYear: 2099, period: "FY", revenue: 400, grossProfit: 200 },
        { date: "2099-09-30", fiscalYear: 2099, period: "Q3", revenue: 100, grossProfit: 60, operatingIncome: 20, netIncome: 15 },
      ] } });
    }
    return jsonResponse({ success: true, result: { data: [
      { date: "2099-09-30", inventory: 10, operatingCashFlow: 12 },
    ] } });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const rows = await provider.getFinancialStatements("NKE", 4);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].period, "Q3");
  assert.equal(rows[0].revenue, 100);
});

test("revenue segments keep only explicit quarterly periods", async (t) => {
  stubFetch(t, () => jsonResponse({ success: true, result: { data: [
    { date: "2099-12-31", fiscalYear: 2099, period: "annual", data: { Shoes: 400 } },
    { date: "2099-09-30", fiscalYear: 2099, period: "Q3", data: { Shoes: 100, Apparel: 80 } },
  ] } }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const rows = await provider.getRevenueSegments("NKE", 4);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].period, "Q3");
  assert.deepEqual(rows[0].segments.map((item) => item.name), ["Shoes", "Apparel"]);
});

test("empty transcript stays unavailable without fabricated source refs", async (t) => {
  stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: "transcript-exec",
    result: { data: { quarter: "2099Q3", transcript: [] } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const transcript = await provider.getEarningsTranscript("MU", {
    id: "MU-2099-07-20",
    ticker: "MU",
    fiscalPeriod: "Q3",
    fiscalYear: 2099,
    reportDate: "2099-07-20",
    timing: "after_close",
    status: "reported",
    sourceIds: ["calendar"],
  });

  assert.equal(transcript?.available, false);
  assert.deepEqual(transcript?.sourceIds, []);
  assert.deepEqual(provider.getSourceRefs(), []);
});

test("transcript role separates analyst questions from adjacent management answers", async (t) => {
  stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: "transcript-exec",
    result: { data: { quarter: "2099Q3", transcript: [
      { role: "analyst", speaker: "Analyst", content: "Can you discuss AI demand and gross margin?" },
      { role: "management", speaker: "CFO", content: "AI demand remains strong, and gross margin improved as data center ramps." },
      { role: "analyst", speaker: "Analyst", content: "What about supply constraints?" },
      { role: "operator", speaker: "Operator", content: "Next question." },
    ] } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const transcript = await provider.getEarningsTranscript("MU", {
    id: "MU-2099-07-20",
    ticker: "MU",
    fiscalPeriod: "Q3",
    fiscalYear: 2099,
    reportDate: "2099-07-20",
    timing: "after_close",
    status: "reported",
    sourceIds: ["calendar"],
  });

  assert.equal(transcript?.available, true);
  assert.equal(transcript?.managementTone, "more_positive");
  assert.deepEqual(transcript?.repeatedQuestions, [
    "Can you discuss AI demand and gross margin?",
    "What about supply constraints?",
  ]);
  assert.deepEqual(transcript?.managementAnswers, [{
    topic: "Can you discuss AI demand and gross margin?",
    answer: "AI demand remains strong, and gross margin improved as data center ramps.",
    sourceIds: ["MU-qveris-get_earnings_transcript"],
  }]);
});

test("transcript without management tone evidence stays unavailable", async (t) => {
  stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: "transcript-exec",
    result: { data: { quarter: "2099Q3", transcript: [
      { role: "analyst", content: "Can you discuss AI demand?" },
      { role: "management", content: "We will provide details in the filing." },
    ] } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const transcript = await provider.getEarningsTranscript("MU", {
    id: "MU-2099-07-20",
    ticker: "MU",
    fiscalPeriod: "Q3",
    fiscalYear: 2099,
    reportDate: "2099-07-20",
    timing: "after_close",
    status: "reported",
    sourceIds: ["calendar"],
  });

  assert.equal(transcript?.managementTone, "unavailable");
});

test("single transcript risk mention does not fabricate change-vs-prior risk language", async (t) => {
  stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: "transcript-exec",
    result: { data: { quarter: "2099Q3", transcript: [
      { role: "management", content: "We continue to monitor supply risk carefully." },
    ] } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const transcript = await provider.getEarningsTranscript("MU", {
    id: "MU-2099-07-20",
    ticker: "MU",
    fiscalPeriod: "Q3",
    fiscalYear: 2099,
    reportDate: "2099-07-20",
    timing: "after_close",
    status: "reported",
    sourceIds: ["calendar"],
  });

  assert.equal(transcript?.riskLanguage, "unavailable");
});

test("full content hydration only fetches trusted https urls", async (t) => {
  const calls = stubFetch(t, () => jsonResponse({
    success: true,
    result: { data: { full_content_file_url: "http://qveris.ai/full.json" } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await provider.getCompanyProfile("AAPL"))?.name, "AAPL");
  assert.equal(calls.length, 1);
});

test("full content hydration refuses untrusted redirects", async (t) => {
  const calls = stubFetch(t, (url) => {
    if (url === "https://qveris.ai/full.json") {
      return new Response(null, { status: 302, headers: { location: "https://evil.test/full.json" } });
    }
    return jsonResponse({
      success: true,
      result: { data: { full_content_file_url: "https://qveris.ai/full.json" } },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await provider.getCompanyProfile("AAPL"))?.name, "AAPL");
  assert.equal(calls.length, 2);
});

test("full content hydration refuses oversized downloads", async (t) => {
  const calls = stubFetch(t, (url) => {
    if (url === "https://qveris.ai/full.json") {
      return new Response("{}", { headers: { "content-length": "3000000" } });
    }
    return jsonResponse({
      success: true,
      result: { data: { full_content_file_url: "https://qveris.ai/full.json" } },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await provider.getCompanyProfile("AAPL"))?.name, "AAPL");
  assert.equal(calls.length, 2);
});

test("full content hydration accepts trusted public downloads", async (t) => {
  const calls = stubFetch(t, (url) => {
    if (url === "https://qveris.ai/full.json") {
      return new Response(JSON.stringify({ ticker: "AAPL", name: "Apple Inc." }), {
        headers: { "content-length": "39" },
      });
    }
    return jsonResponse({
      success: true,
      result: { data: { full_content_file_url: "https://qveris.ai/full.json" } },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await provider.getCompanyProfile("AAPL"))?.name, "Apple Inc.");
  assert.equal(calls.length, 2);
});

test("full content hydration accepts QVeris object storage host", async (t) => {
  const calls = stubFetch(t, (url) => {
    if (url === "https://oss.qveris.cn/full.json") {
      return new Response(JSON.stringify({ earningsCalendar: [{ symbol: "MU", date: "2026-06-24" }] }));
    }
    return jsonResponse({
      success: true,
      result: { full_content_file_url: "https://oss.qveris.cn/full.json" },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await provider.getEarningsCalendar({ from: "2026-06-23", to: "2026-06-29", universe: "MU" }))[0].ticker, "MU");
  assert.equal(calls.length, 2);
});

test("full content hydration rewrites private QVeris result urls to the public API", async (t) => {
  const calls = stubFetch(t, (url) => {
    if (url === "https://qveris.ai/api/v1/tool-results/signed-result") {
      return new Response(JSON.stringify({ earningsCalendar: [{ symbol: "MU", date: "2026-06-24" }] }));
    }
    return jsonResponse({
      success: true,
      result: { full_content_file_url: "http://172.22.207.245:8155/api/v1/api/v1/tool-results/signed-result" },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.ai/api/v1", apiKey: "key" });
  assert.equal((await provider.getEarningsCalendar({ from: "2026-06-24", to: "2026-06-24", universe: "MU" }))[0].ticker, "MU");
  assert.equal(calls.length, 2);
});

test("business success false throws a structured QVerisCapabilityError", async (t) => {
  stubFetch(t, () => jsonResponse({
    success: false,
    status_code: 404,
    error_type: "tool_unavailable",
    message: "Tool is unavailable",
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getCompanyProfile("AAPL"),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.toolId, "finnhub.company.profile.v2.get.v1");
      assert.equal(error.errorType, "tool_unavailable");
      assert.equal(error.statusCode, 404);
      assert.equal(error.message, "Tool is unavailable");
      return true;
    },
  );
});

test("business errors use payload.error as the error message", async (t) => {
  stubFetch(t, () => jsonResponse({ success: false, error: "Provider rejected request" }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getCompanyProfile("AAPL"),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "business_error");
      assert.equal(error.message, "Provider rejected request");
      return true;
    },
  );
});

test("retryable provider response read failure is retried once and then succeeds", async (t) => {
  const calls = stubFetch(t, () => calls.length === 1
    ? providerReadFailedResponse()
    : jsonResponse({
      success: true,
      execution_id: "profile-exec",
      result: { data: { ticker: "MU", name: "Micron Technology" } },
    }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await provider.getCompanyProfile("MU"))?.name, "Micron Technology");
  assert.equal(calls.length, 2);
});

test("empty unsuccessful calendar response is retried once and then maps MU", async (t) => {
  const calls = stubFetch(t, () => calls.length === 1
    ? emptyProviderResponse()
    : jsonResponse({
      success: true,
      execution_id: "calendar-exec",
      result: {
        data: {
          earningsCalendar: [{
            symbol: "MU",
            date: "2026-06-24",
            hour: "amc",
            quarter: 3,
            year: 2026,
            epsEstimate: 21.4019,
            epsActual: 25.11,
            revenueEstimate: 36_923_508_824,
            revenueActual: 41_456_000_000,
          }],
        },
      },
    }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const events = await provider.getEarningsCalendar({ from: "2026-06-23", to: "2026-06-29", universe: "MU" });

  assert.equal(calls.length, 2);
  assert.equal(events[0].ticker, "MU");
  assert.equal(events[0].reportDate, "2026-06-24");
  assert.equal(events[0].epsActual, 25.11);
  assert.equal(events[0].revenueActual, 41_456_000_000);
});

test("empty unsuccessful calendar response remains explicit after one retry", async (t) => {
  const calls = stubFetch(t, () => emptyProviderResponse());

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getEarningsCalendar({ from: "2026-06-23", to: "2026-06-29", universe: "MU" }),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "provider_empty_response");
      assert.equal(error.statusCode, 200);
      assert.match(error.message, /empty result data/);
      return true;
    },
  );
  assert.equal(calls.length, 2);
});

test("success false empty calendar array is retried once and remains explicit", async (t) => {
  const calls = stubFetch(t, () => jsonResponse({ success: false, result: { status_code: 200, data: { earningsCalendar: [] } } }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getEarningsCalendar({ from: "2026-06-23", to: "2026-06-29", universe: "MU" }),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "provider_empty_response");
      assert.equal(error.statusCode, 200);
      return true;
    },
  );
  assert.equal(calls.length, 2);
});

test("success false non-empty data is not cached as success", async (t) => {
  const calls = stubFetch(t, () => calls.length === 1
    ? jsonResponse({ success: false, result: { status_code: 200, data: { earningsCalendar: [{ symbol: "MU", date: "2026-06-24" }] } } })
    : jsonResponse({ success: true, result: { data: { earningsCalendar: [{ symbol: "MU", date: "2026-06-24" }] } } }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getEarningsCalendar({ from: "2026-06-23", to: "2026-06-29", universe: "MU" }),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "business_error");
      return true;
    },
  );
  assert.equal((await provider.getEarningsCalendar({ from: "2026-06-23", to: "2026-06-29", universe: "MU" }))[0].ticker, "MU");
  assert.equal(calls.length, 2);
});

test("retryable provider response read failure remains explicit after one retry", async (t) => {
  const calls = stubFetch(t, () => providerReadFailedResponse());

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getCompanyProfile("MU"),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "provider_response_read_failed");
      assert.equal(error.statusCode, 200);
      assert.match(error.message, /第三方服务响应读取失败/);
      return true;
    },
  );
  assert.equal(calls.length, 2);
});

test("retryable provider response read failure is not cached", async (t) => {
  const calls = stubFetch(t, () => calls.length <= 2
    ? providerReadFailedResponse()
    : jsonResponse({
      success: true,
      execution_id: "profile-exec",
      result: { data: { ticker: "MU", name: "Micron Technology" } },
    }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(() => provider.getCompanyProfile("MU"), QVerisCapabilityError);
  assert.equal((await provider.getCompanyProfile("MU"))?.name, "Micron Technology");
  assert.equal(calls.length, 3);
});

test("http failures keep status code on QVerisCapabilityError", async (t) => {
  stubFetch(t, () => jsonResponse({ error: "bad gateway" }, 502));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getCompanyProfile("AAPL"),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "http_error");
      assert.equal(error.statusCode, 502);
      return true;
    },
  );
});

test("fetch timeout is classified on QVerisCapabilityError", async (t) => {
  stubFetch(t, () => {
    throw Object.assign(new Error("deadline"), { name: "TimeoutError" });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(
    () => provider.getCompanyProfile("AAPL"),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "timeout");
      assert.equal(error.statusCode, undefined);
      return true;
    },
  );
});

test("unexpired raw cache hit uses normalized baseUrl namespace without api key", async (t) => {
  const calls = stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: "profile-exec",
    result: { data: { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" } },
  }));

  const first = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api/", apiKey: "key-a" });
  assert.equal((await first.getCompanyProfile("AAPL"))?.name, "Apple Inc.");

  const second = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key-b" });
  assert.equal((await second.getCompanyProfile("AAPL"))?.name, "Apple Inc.");
  assert.equal(calls.length, 1);
});

test("business errors are not cached", async (t) => {
  const calls = stubFetch(t, () => calls.length === 1
    ? jsonResponse({ success: false, error: "Provider rejected request" })
    : jsonResponse({
      success: true,
      execution_id: "profile-exec",
      result: { data: { ticker: "AAPL", name: "Apple Inc." } },
    }));

  const first = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(() => first.getCompanyProfile("AAPL"), QVerisCapabilityError);

  const second = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await second.getCompanyProfile("AAPL"))?.name, "Apple Inc.");
  assert.equal(calls.length, 2);
});

test("failed in-flight execution is removed so the same provider can retry", async (t) => {
  const calls = stubFetch(t, () => calls.length === 1
    ? jsonResponse({ success: false, error: "Provider rejected request" })
    : jsonResponse({
      success: true,
      execution_id: "profile-exec",
      result: { data: { ticker: "AAPL", name: "Apple Inc." } },
    }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  await assert.rejects(() => provider.getCompanyProfile("AAPL"), QVerisCapabilityError);

  assert.equal((await provider.getCompanyProfile("AAPL"))?.name, "Apple Inc.");
  assert.equal(calls.length, 2);
});

test("settled in-flight execution is removed after success", async (t) => {
  const calls = stubFetch(t, () => jsonResponse({
    success: true,
    execution_id: `profile-exec-${calls.length}`,
    result: { data: { ticker: "AAPL", name: `Apple ${calls.length}` } },
  }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  assert.equal((await provider.getCompanyProfile("AAPL"))?.name, "Apple 1");

  __clearQVerisFetchCacheForTests();
  assert.equal((await provider.getCompanyProfile("AAPL"))?.name, "Apple 2");
  assert.equal(calls.length, 2);
});

test("missing api key throws config_error instead of returning empty data", async (t) => {
  resetCache(t);
  await assert.rejects(
    () => new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "" }).getEarningsCalendar({ from: "2099-07-20", to: "2099-07-20" }),
    (error) => {
      assert.ok(error instanceof QVerisCapabilityError);
      assert.equal(error.errorType, "config_error");
      return true;
    },
  );
});

test("filings resolve cik first, then map SEC filing search rows", async (t) => {
  const calls = stubFetch(t, () => {
    if (calls.length === 1) {
      return jsonResponse({
        success: true,
        execution_id: "cik-exec",
        result: { data: [{ symbol: "AAPL", cik: "0000320193" }] },
      });
    }
    return jsonResponse({
      success: true,
      execution_id: "filings-exec",
      result: {
        data: [{
          symbol: "AAPL",
          cik: "0000320193",
          filingDate: "2099-01-31",
          acceptedDate: "2099-01-31 16:30:00",
          formType: "10-K",
          reportUrl: "https://example.test/report",
          link: "https://example.test/link",
          finalLink: "https://example.test/final",
        }],
      },
    });
  });

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const filings = await provider.getSecFilings("aapl", { from: "2099-01-01", to: "2099-12-31", limit: 2 });

  assert.equal(calls[0].body?.tool_id, "financialmodelingprep.stable.secfilingscompanysearch.symbol.retrieve.v1.5cf7397d");
  assert.deepEqual(calls[0].body?.parameters, { symbol: "AAPL" });
  assert.equal(calls[1].body?.tool_id, "financialmodelingprep.stable.secfilingssearch.cik.retrieve.v1.6c73a2ce");
  assert.deepEqual(calls[1].body?.parameters, { cik: "0000320193", from: "2099-01-01", to: "2099-12-31", page: "0", limit: "2" });
  assert.deepEqual(filings, [{
    id: "AAPL-filing-0",
    formType: "10-K",
    filedAt: "2099-01-31",
    title: "10-K",
    url: "https://example.test/report",
    summary: undefined,
    sourceIds: ["AAPL-qveris-get_sec_filings"],
  }]);
});

test("filings prefer link over finalLink when reportUrl is absent", async (t) => {
  const calls = stubFetch(t, () => calls.length === 1
    ? jsonResponse({ success: true, result: { data: [{ cik: "0000320193" }] } })
    : jsonResponse({
      success: true,
      result: { data: [{ formType: "10-Q", filingDate: "2099-04-30", link: "https://example.test/link", finalLink: "https://example.test/final" }] },
    }));

  const provider = new QVerisCapabilityProvider({ baseUrl: "https://qveris.test/api", apiKey: "key" });
  const filings = await provider.getSecFilings("AAPL");

  assert.equal(filings[0].url, "https://example.test/link");
});
