import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import { localEnv } from "@/lib/runtime/env";
import type {
  AnalystParams,
  AnalystRevision,
  CompanyProfile,
  EarningsCalendarParams,
  EarningsEstimates,
  EarningsEvent,
  EarningsResults,
  FilingItem,
  FilingParams,
  FinancialStatementPeriod,
  HistoricalEarnings,
  HistoricalPriceParams,
  NewsItem,
  NewsParams,
  PriceBar,
  SegmentRevenue,
  SourceRef,
  StockQuote,
  TranscriptInsight,
} from "@/lib/earnings/types";
import { calendarSymbolsForUniverse } from "@/lib/earnings/universe";
import { filterRelevantNews, selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import { readQVerisFetchCache, writeQVerisFetchCache } from "@/lib/capabilities/qverisFetchCache";

const DEFAULT_BASE_URL = "https://qveris.ai/api/v1";
const CALENDAR_TOOL_ID = "finnhub.calendar.earnings.retrieve.v1.1552775d";
const PROFILE_TOOL_ID = "finnhub.company.profile.v2.get.v1";
const EARNINGS_HISTORY_TOOL_ID = "alphavantage.earnings.retrieve.v1.467a92c0";
const ESTIMATES_TOOL_ID = "alphavantage.earnings_estimates.retrieve.v1.467a92c0";
const QUOTE_TOOL_ID = "eodhd.live_v2.us_quote_delayed.retrieve.v1.f0e13d45";
const HISTORICAL_PRICE_TOOL_ID = "alphavantage.time-series.daily-adjusted.v1";
const NEWS_TOOL_ID = "qveris_finance.finance_news_aggregation_v1";
const FILINGS_CIK_TOOL_ID = "financialmodelingprep.stable.secfilingscompanysearch.symbol.retrieve.v1.5cf7397d";
const FILINGS_SEARCH_TOOL_ID = "financialmodelingprep.stable.secfilingssearch.cik.retrieve.v1.6c73a2ce";
const TRANSCRIPT_TOOL_ID = "alphavantage.earnings_call_transcript.query.v1.467a92c0";
const INCOME_STATEMENT_TOOL_ID = "financialmodelingprep.stable.incomestatement.retrieve.v1.dd6d583f";
const BALANCE_SHEET_TOOL_ID = "financialmodelingprep.stable.balancesheetstatement.retrieve.v1.bce203b1";
const CASH_FLOW_TOOL_ID = "financialmodelingprep.stable.cashflowstatement.retrieve.v1.dfeb9354";
const REVENUE_SEGMENT_TOOL_ID = "financialmodelingprep.stable.revenueproductsegmentation.retrieve.v1.8faa287f";
const RAW_CACHE_NAMESPACE_VERSION = 1;
const MAX_FULL_CONTENT_BYTES = 2 * 1024 * 1024;
const TRUSTED_FULL_CONTENT_HOSTS = new Set([
  "qveris.ai",
  "oss.qveris.cn",
  "storage.googleapis.com",
  "s3.amazonaws.com",
]);

export type QVerisCapabilityErrorType = "config_error" | "http_error" | "business_error" | "timeout" | "network_error" | (string & {});

export class QVerisCapabilityError extends Error {
  constructor(
    readonly toolId: string,
    readonly errorType: QVerisCapabilityErrorType,
    readonly statusCode?: number,
    message = `QVeris capability failed: ${toolId}`,
  ) {
    super(message);
    this.name = "QVerisCapabilityError";
  }
}

export class QVerisCapabilityProvider implements EarningsCapabilityProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly cacheNamespace: string;
  private readonly sourceRefs = new Map<string, SourceRef>();
  private readonly executions = new Map<string, Promise<{ data: unknown; executionId?: string; success: boolean }>>();

  constructor(options: { baseUrl?: string; apiKey?: string } = {}) {
    const env = localEnv();
    this.baseUrl = (options.baseUrl ?? env.QVERIS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? env.QVERIS_API_KEY;
    this.cacheNamespace = `${this.baseUrl}:qveris-provider-cache:v${RAW_CACHE_NAMESPACE_VERSION}`;
  }

  getSourceRefs() {
    return [...this.sourceRefs.values()];
  }

  async getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
    const call = await this.execute(PROFILE_TOOL_ID, { symbol: ticker });
    const data = asRecord(call.data);
    if (!data) return null;
    const sourceId = this.recordSource(ticker, "get_company_profile", "QVeris company profile", PROFILE_TOOL_ID, call.executionId);
    return {
      ticker: stringValue(data.ticker) ?? ticker.toUpperCase(),
      name: stringValue(data.name) ?? ticker.toUpperCase(),
      exchange: stringValue(data.exchange),
      sector: stringValue(data.finnhubIndustry),
      industry: stringValue(data.finnhubIndustry),
      marketCap: numberValue(data.marketCapitalization) ? numberValue(data.marketCapitalization)! * 1_000_000 : undefined,
      currency: stringValue(data.currency),
      sourceIds: [sourceId],
    };
  }

  async getEarningsCalendar(params: EarningsCalendarParams): Promise<EarningsEvent[]> {
    const allowedSymbols = calendarSymbolsForUniverse(params.universe);
    const today = todayIso();
    const rows = await mapLimit(calendarRanges(params.from, params.to), 3, (range) => this.execute(CALENDAR_TOOL_ID, range));
    const seen = new Set<string>();
    return rows.flatMap((payload) => {
      const events = asRecord(payload.data)?.earningsCalendar;
      if (!Array.isArray(events)) throw new QVerisCapabilityError(CALENDAR_TOOL_ID, "business_error", undefined, "QVeris calendar payload missing earningsCalendar array");
      return events
        .filter((event): event is Record<string, unknown> => Boolean(asRecord(event)?.date))
        .filter((event) => {
          const ticker = String(event.symbol || "").toUpperCase();
          return !allowedSymbols || allowedSymbols.includes(ticker);
        })
        .filter((event) => {
          const key = `${String(event.symbol).toUpperCase()}-${String(event.date)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((event): EarningsEvent => {
          const ticker = String(event.symbol || "UNKNOWN").toUpperCase();
          const sourceId = this.recordSource(ticker, "get_earnings_calendar", "QVeris earnings calendar", CALENDAR_TOOL_ID, payload.executionId);
          return {
            id: `${ticker}-${event.date}`,
            ticker,
            fiscalPeriod: event.quarter ? `Q${event.quarter}` : undefined,
            fiscalYear: event.year ? Number(event.year) : undefined,
            reportDate: String(event.date),
            timing: normalizeTiming(event.hour),
            status: normalizeStatus(event, today),
            revenueActual: numberValue(event.revenueActual),
            epsActual: numberValue(event.epsActual),
            revenueEstimate: numberValue(event.revenueEstimate),
            epsEstimate: numberValue(event.epsEstimate),
            sourceIds: [sourceId],
          };
        });
    });
  }

  async getEarningsEstimates(ticker: string, event?: string | EarningsEvent | null): Promise<EarningsEstimates | null> {
    const call = await this.execute(ESTIMATES_TOOL_ID, { symbol: ticker, function: "EARNINGS_ESTIMATES" });
    const data = parsePossiblyTruncated(call.data);
    const estimates = Array.isArray(asRecord(data)?.estimates) ? asRecord(data)!.estimates as Record<string, unknown>[] : [];
    const selected = selectEstimate(estimates, event);
    if (!selected) return null;
    const sourceId = this.recordSource(ticker, "get_earnings_estimates", "QVeris consensus estimates", ESTIMATES_TOOL_ID, call.executionId);
    const eventId = typeof event === "string" ? event : event?.id;
    return {
      ticker: ticker.toUpperCase(),
      eventId,
      revenueEstimate: numberValue(selected.revenue_estimate_average),
      epsEstimate: numberValue(selected.eps_estimate_average),
      estimateCount: numberValue(selected.eps_estimate_analyst_count) ?? numberValue(selected.revenue_estimate_analyst_count),
      sourceIds: [sourceId],
    };
  }

  async getEarningsResults(ticker: string, event?: EarningsEvent | null): Promise<EarningsResults | null> {
    const [history, financials, segments, transcript] = await Promise.all([
      this.getHistoricalEarnings(ticker, 8),
      this.getFinancialStatements(ticker, 4),
      this.getRevenueSegments(ticker, 4),
      this.getTranscriptEntries(ticker, event),
    ]);
    const latest = selectHistoricalPeriod(history, event);
    const latestFinancials = selectFiscalPeriod(financials, event);
    const latestSegments = selectFiscalPeriod(segments, event);
    const guidanceText = extractGuidanceText(transcript.entries);
    const calendarSourceIds = event?.sourceIds ?? [];
    const revenueSourceIds = event?.revenueActual != null ? calendarSourceIds : latestFinancials?.sourceIds;
    const epsSourceIds = event?.epsActual != null ? calendarSourceIds : latest?.sourceIds;
    const guidanceSourceIds = guidanceText
      ? [this.recordSource(ticker, "get_earnings_guidance", "QVeris prepared earnings guidance", TRANSCRIPT_TOOL_ID, transcript.executionId)]
      : undefined;
    if (event?.revenueActual == null && event?.epsActual == null && !latest && !latestFinancials) return null;
    return {
      ticker: ticker.toUpperCase(),
      eventId: event?.id,
      revenueActual: event?.revenueActual ?? latestFinancials?.revenue,
      epsActual: event?.epsActual ?? latest?.epsActual,
      grossMargin: latestFinancials?.grossMargin,
      operatingMargin: latestFinancials?.operatingMargin,
      netIncome: latestFinancials?.netIncome,
      guidanceText,
      segmentHighlights: latestSegments?.segments.slice(0, 4).map((item) => `${item.name}: ${item.revenue}`),
      sourceIds: [...new Set([
        ...(revenueSourceIds ?? []),
        ...(epsSourceIds ?? []),
        ...(latestFinancials?.sourceIds ?? []),
        ...(latestSegments?.sourceIds ?? []),
        ...(guidanceSourceIds ?? []),
      ])],
      fieldSourceIds: {
        revenueActual: revenueSourceIds,
        epsActual: epsSourceIds,
        grossMargin: latestFinancials?.sourceIds,
        operatingMargin: latestFinancials?.sourceIds,
        netIncome: latestFinancials?.sourceIds,
        guidanceText: guidanceSourceIds,
        segmentHighlights: latestSegments?.sourceIds,
      },
    };
  }

  async getHistoricalEarnings(ticker: string, limit = 8): Promise<HistoricalEarnings[]> {
    const call = await this.execute(EARNINGS_HISTORY_TOOL_ID, { symbol: ticker, function: "EARNINGS" });
    const data = parsePossiblyTruncated(call.data);
    const rows = Array.isArray(asRecord(data)?.quarterlyEarnings) ? asRecord(data)!.quarterlyEarnings as Record<string, unknown>[] : [];
    const sourceId = this.recordSource(ticker, "get_historical_earnings", "QVeris earnings history", EARNINGS_HISTORY_TOOL_ID, call.executionId);
    return rows.slice(0, limit).map((row, index) => ({
      eventId: `${ticker.toUpperCase()}-earnings-${stringValue(row.fiscalDateEnding) ?? index}`,
      fiscalPeriod: stringValue(row.fiscalDateEnding),
      reportDate: stringValue(row.reportedDate) ?? stringValue(row.fiscalDateEnding) ?? todayIso(),
      epsActual: numberValue(row.reportedEPS),
      epsEstimate: numberValue(row.estimatedEPS),
      sourceIds: [sourceId],
    }));
  }

  async getStockQuote(ticker: string): Promise<StockQuote | null> {
    const call = await this.execute(QUOTE_TOOL_ID, { s: ticker, fmt: "json" });
    const data = asRecord(asRecord(call.data)?.data);
    const row = data ? asRecord(data[`${ticker.toUpperCase()}.US`]) ?? asRecord(Object.values(data)[0]) : null;
    if (!row) return null;
    const sourceId = this.recordSource(ticker, "get_stock_quote", "QVeris delayed stock quote", QUOTE_TOOL_ID, call.executionId);
    return {
      ticker: ticker.toUpperCase(),
      price: numberValue(row.lastTradePrice) ?? numberValue(row.close) ?? numberValue(row.previousClosePrice),
      changePct: numberValue(row.changePercent),
      volume: numberValue(row.volume),
      avgVolume30d: numberValue(row.averageVolume),
      timestamp: new Date(numberValue(row.timestamp) ? numberValue(row.timestamp)! * 1000 : Date.now()).toISOString(),
      sourceIds: [sourceId],
    };
  }

  async getHistoricalPrices(ticker: string, params: HistoricalPriceParams): Promise<PriceBar[]> {
    const call = await this.execute(HISTORICAL_PRICE_TOOL_ID, {
      symbol: ticker,
      function: "TIME_SERIES_DAILY_ADJUSTED",
      outputsize: "compact",
      datatype: "json",
    });
    const data = asRecord(parsePossiblyTruncated(call.data));
    const series = asRecord(data?.["Time Series (Daily)"]);
    if (!series) return [];
    const sourceId = this.recordSource(ticker, "get_historical_prices", "QVeris adjusted daily prices", HISTORICAL_PRICE_TOOL_ID, call.executionId);
    return Object.entries(series)
      .filter(([date]) => date >= params.from && date <= params.to)
      .flatMap(([date, value]): PriceBar[] => {
        const row = asRecord(value);
        const rawClose = numberValue(row?.["4. close"]);
        const adjustedClose = numberValue(row?.["5. adjusted close"]) ?? rawClose;
        if (adjustedClose == null) return [];
        const adjustment = rawClose ? adjustedClose / rawClose : 1;
        const rawOpen = numberValue(row?.["1. open"]);
        return [{
          date,
          open: rawOpen == null ? undefined : rawOpen * adjustment,
          close: adjustedClose,
          volume: numberValue(row?.["6. volume"]),
          sourceIds: [sourceId],
        }];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getFinancialStatements(ticker: string, limit = 4): Promise<FinancialStatementPeriod[]> {
    const symbol = ticker.toUpperCase();
    const [incomeCall, balanceCall, cashFlowCall] = await Promise.all([
      this.execute(INCOME_STATEMENT_TOOL_ID, { symbol, period: "quarter", limit }),
      this.execute(BALANCE_SHEET_TOOL_ID, { symbol, period: "quarter", limit }),
      this.execute(CASH_FLOW_TOOL_ID, { symbol, period: "quarter", limit }),
    ]);
    const incomeSource = this.recordSource(symbol, "get_income_statement", "QVeris income statement", INCOME_STATEMENT_TOOL_ID, incomeCall.executionId);
    const balanceSource = this.recordSource(symbol, "get_balance_sheet", "QVeris balance sheet", BALANCE_SHEET_TOOL_ID, balanceCall.executionId);
    const cashFlowSource = this.recordSource(symbol, "get_cash_flow", "QVeris cash flow statement", CASH_FLOW_TOOL_ID, cashFlowCall.executionId);
    const incomeRows = arrayRecords(incomeCall.data);
    const balanceByDate = byDate(arrayRecords(balanceCall.data));
    const cashFlowByDate = byDate(arrayRecords(cashFlowCall.data));

    return incomeRows.filter((income) => isQuarterlyPeriod(stringValue(income.period))).slice(0, limit).map((income) => {
      const date = stringValue(income.date) ?? todayIso();
      const balance = balanceByDate.get(date) ?? {};
      const cashFlow = cashFlowByDate.get(date) ?? {};
      const revenue = numberValue(income.revenue);
      const grossProfit = numberValue(income.grossProfit);
      const operatingIncome = numberValue(income.operatingIncome);
      return {
        date,
        fiscalYear: numberValue(income.fiscalYear),
        period: stringValue(income.period),
        revenue,
        grossProfit,
        operatingIncome,
        netIncome: numberValue(income.netIncome),
        grossMargin: pct(grossProfit, revenue),
        operatingMargin: pct(operatingIncome, revenue),
        operatingCashFlow: numberValue(cashFlow.operatingCashFlow) ?? numberValue(cashFlow.netCashProvidedByOperatingActivities),
        freeCashFlow: numberValue(cashFlow.freeCashFlow),
        capitalExpenditure: numberValue(cashFlow.capitalExpenditure) ?? numberValue(cashFlow.investmentsInPropertyPlantAndEquipment),
        inventory: numberValue(balance.inventory),
        accountsReceivable: numberValue(balance.accountsReceivables) ?? numberValue(balance.netReceivables),
        totalDebt: numberValue(balance.totalDebt),
        cashAndEquivalents: numberValue(balance.cashAndCashEquivalents),
        sourceIds: [incomeSource, balanceSource, cashFlowSource],
      };
    });
  }

  async getRevenueSegments(ticker: string, limit = 4): Promise<SegmentRevenue[]> {
    const symbol = ticker.toUpperCase();
    const call = await this.execute(REVENUE_SEGMENT_TOOL_ID, { symbol, period: "quarter" });
    const sourceId = this.recordSource(symbol, "get_revenue_segments", "QVeris revenue product segmentation", REVENUE_SEGMENT_TOOL_ID, call.executionId);
    return arrayRecords(call.data).filter((row) => isQuarterlyPeriod(stringValue(row.period))).slice(0, limit).map((row) => {
      const data = asRecord(row.data) ?? {};
      return {
        date: stringValue(row.date) ?? todayIso(),
        fiscalYear: numberValue(row.fiscalYear),
        period: stringValue(row.period),
        segments: Object.entries(data)
          .map(([name, value]) => ({ name, revenue: numberValue(value) }))
          .filter((item): item is { name: string; revenue: number } => item.revenue != null)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 6),
        sourceIds: [sourceId],
      };
    });
  }

  async getFinancialNews(ticker: string, params: NewsParams = {}): Promise<NewsItem[]> {
    const [call, company] = await Promise.all([
      this.execute(NEWS_TOOL_ID, { query: `${ticker} earnings`, limit: Math.max((params.limit ?? 5) * 3, 10) }),
      this.getCompanyProfile(ticker),
    ]);
    const results = asRecord(call.data)?.results;
    if (!Array.isArray(results)) return [];
    const sourceId = this.recordSource(ticker, "get_financial_news", "QVeris finance news aggregation", NEWS_TOOL_ID, call.executionId);
    const items = results.map((item, index) => {
      const row = asRecord(item) ?? {};
      return {
        id: `${ticker.toUpperCase()}-news-${index}`,
        title: stringValue(row.title) ?? "Untitled news item",
        summary: stringValue(row._summary) || stringValue(row.description) || stringValue(row.body),
        url: stringValue(row.url),
        publishedAt: stringValue(row.published_date) || stringValue(row._time_published),
        provider: stringValue(row.source) ?? "QVeris",
        sourceIds: [sourceId],
      };
    });
    return filterRelevantNews(ticker, company?.name, items).slice(0, params.limit ?? 5);
  }

  async getSecFilings(ticker: string, params: FilingParams = {}): Promise<FilingItem[]> {
    const symbol = ticker.toUpperCase();
    const to = params.to ?? todayIso();
    const from = params.from ?? addDaysIso(to, -365);
    const cikCall = await this.execute(FILINGS_CIK_TOOL_ID, { symbol });
    const cik = stringValue(asRecord(cikCall.data)?.cik) ?? stringValue(arrayRecords(cikCall.data)[0]?.cik);
    if (!cik) return [];
    const call = await this.execute(FILINGS_SEARCH_TOOL_ID, { cik, from, to, page: "0", limit: String(params.limit ?? 5) });
    const rows = arrayRecords(call.data);
    const sourceId = this.recordSource(symbol, "get_sec_filings", "QVeris SEC filings", FILINGS_SEARCH_TOOL_ID, call.executionId);
    const filings = rows.map((row, index): FilingItem => ({
      id: stringValue(row.accessNumber) ?? `${symbol}-filing-${index}`,
      formType: normalizeFormType(stringValue(row.form) ?? stringValue(row.formType)),
      filedAt: stringValue(row.filedDate) ?? stringValue(row.filingDate) ?? stringValue(row.acceptedDate) ?? todayIso(),
      title: stringValue(row.form) ?? stringValue(row.formType),
      url: stringValue(row.reportUrl) ?? stringValue(row.link) ?? stringValue(row.finalLink),
      summary: stringValue(row.description),
      sourceIds: [sourceId],
    }));
    return filings
      .filter((filing) => !params.formTypes?.length || params.formTypes.includes(filing.formType))
      .slice(0, params.limit ?? 5);
  }

  async getEarningsTranscript(ticker: string, event?: EarningsEvent | null): Promise<TranscriptInsight | null> {
    const transcript = await this.getTranscriptEntries(ticker, event);
    const content = transcript.entries.map((entry) => stringValue(entry.content)).filter(Boolean).join("\n");
    if (!content) return { available: false, sourceIds: [] };
    const sourceId = this.recordSource(ticker, "get_earnings_transcript", "QVeris earnings call transcript", TRANSCRIPT_TOOL_ID, transcript.executionId);
    const managementText = transcript.entries
      .filter((entry) => transcriptRole(entry) === "management")
      .map((entry) => stringValue(entry.content))
      .filter(Boolean)
      .join("\n");
    return {
      available: true,
      managementTone: toneFromDirectionalEvidence(managementText),
      guidanceTone: toneFromText(content, "guidance"),
      riskLanguage: "unavailable",
      repeatedQuestions: extractAnalystQuestionTopics(transcript.entries),
      managementAnswers: extractManagementAnswers(transcript.entries, [sourceId]),
      keyQuotes: [],
      sourceIds: [sourceId],
    };
  }

  async getAnalystRevisions(ticker: string, _params: AnalystParams = {}): Promise<AnalystRevision[]> {
    return [];
  }

  private async getTranscriptEntries(ticker: string, event?: EarningsEvent | null) {
    const period = transcriptPeriod(event);
    if (!period) return { entries: [] as Record<string, unknown>[], executionId: undefined };
    const expectedQuarter = `${period.year}Q${period.quarter}`;
    const call = await this.execute(TRANSCRIPT_TOOL_ID, {
      symbol: ticker,
      quarter: expectedQuarter,
      function: "EARNINGS_CALL_TRANSCRIPT",
    });
    const data = asRecord(parsePossiblyTruncated(call.data));
    if (!data || stringValue(data.quarter)?.toUpperCase() !== expectedQuarter) {
      return { entries: [] as Record<string, unknown>[], executionId: call.executionId };
    }
    return { entries: arrayRecords(data.transcript), executionId: call.executionId };
  }

  private recordSource(ticker: string, capability: string, title: string, toolId: string, executionId?: string) {
    const id = `${ticker.toUpperCase()}-qveris-${capability}`;
    this.sourceRefs.set(id, {
      id,
      title,
      provider: "QVeris",
      retrievedAt: new Date().toISOString(),
      capability,
      executionId,
      url: undefined,
    });
    return id;
  }

  private execute(toolId: string, parameters: Record<string, unknown>): Promise<{ data: unknown; executionId?: string; success: boolean }> {
    const key = `${toolId}:${JSON.stringify(parameters)}`;
    const existing = this.executions.get(key);
    if (existing) return existing;
    const execution = this.executeOnce(toolId, parameters);
    this.executions.set(key, execution);
    execution.then(
      () => {
        if (this.executions.get(key) === execution) this.executions.delete(key);
      },
      () => {
        if (this.executions.get(key) === execution) this.executions.delete(key);
      },
    );
    return execution;
  }

  private async executeOnce(toolId: string, parameters: Record<string, unknown>): Promise<{ data: unknown; executionId?: string; success: boolean }> {
    if (!this.apiKey) throw new QVerisCapabilityError(toolId, "config_error", undefined, "QVeris API key is not configured");
    const cached = await readQVerisFetchCache(toolId, parameters, this.cacheNamespace);
    if (cached) return { ...cached, success: true };
    let lastRetryableProviderError: QVerisCapabilityError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.fetchOnce(toolId, parameters);
        await writeQVerisFetchCache(toolId, parameters, { data: result.data, executionId: result.executionId }, this.cacheNamespace);
        return result;
      } catch (error) {
        if (!(error instanceof QVerisCapabilityError)) throw error;
        if (!isRetryableProviderResponse(error.errorType) || attempt === 1) throw error;
        lastRetryableProviderError = error;
      }
    }
    throw lastRetryableProviderError ?? new QVerisCapabilityError(toolId, "business_error");
  }

  private async fetchOnce(toolId: string, parameters: Record<string, unknown>): Promise<{ data: unknown; executionId?: string; success: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/tools/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ tool_id: toolId, parameters }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new QVerisCapabilityError(toolId, "http_error", res.status);
      const payload = await res.json();
      const data = await hydrateFullContent(payload?.result?.data ?? payload?.result ?? null);
      if (payload?.success === false) {
        const error = capabilityErrorFromPayload(toolId, payload);
        if (error) throw error;
        if (isEmptyProviderData(data)) {
          throw new QVerisCapabilityError(toolId, "provider_empty_response", numberValue(payload?.result?.status_code) ?? numberValue(payload?.status_code), "QVeris capability returned success:false with empty result data");
        }
        throw new QVerisCapabilityError(toolId, "business_error", numberValue(payload?.result?.status_code) ?? numberValue(payload?.status_code), "QVeris capability returned success:false");
      }
      const executionId = stringValue(payload?.execution_id);
      return { data, executionId, success: payload?.success !== false };
    } catch (error) {
      if (error instanceof QVerisCapabilityError) throw error;
      const name = error instanceof Error ? error.name : "";
      throw new QVerisCapabilityError(toolId, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error");
    }
  }
}

function normalizeTiming(raw: unknown): EarningsEvent["timing"] {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("bmo") || value.includes("before")) return "before_open";
  if (value.includes("amc") || value.includes("after")) return "after_close";
  return "unknown";
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function calendarRanges(from: string, to: string) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || start > end) return [{ from, to }];
  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 6);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    ranges.push({ from: formatIsoDate(cursor), to: formatIsoDate(chunkEnd) });
    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ranges;
}

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeStatus(event: Record<string, unknown>, today: string): EarningsEvent["status"] {
  const rawStatus = String(event.status ?? "").toLowerCase();
  if (rawStatus === "reported" || rawStatus === "upcoming" || rawStatus === "unknown") return rawStatus;
  const date = String(event.date ?? "");
  if (date < today) return "reported";
  if (date > today) return "upcoming";
  if (event.epsActual != null || event.revenueActual != null || event.actual != null) return "reported";
  return "upcoming";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function byDate(rows: Record<string, unknown>[]) {
  return new Map(rows.flatMap((row) => {
    const date = stringValue(row.date);
    return date ? [[date, row] as const] : [];
  }));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function capabilityErrorFromPayload(toolId: string, payload: Record<string, unknown>) {
  const result = asRecord(payload.result);
  const data = asRecord(result?.data);
  const errorType = stringValue(data?.reason_code) ?? stringValue(payload.error_type) ?? "business_error";
  const statusCode = numberValue(result?.status_code) ?? numberValue(payload.status_code);
  const message = stringValue(data?.error) ?? stringValue(payload.error) ?? stringValue(payload.message);
  if (!data?.reason_code && !data?.error && !payload.error_type && !payload.error && !payload.message) return null;
  return new QVerisCapabilityError(toolId, errorType, statusCode, message);
}

function isRetryableProviderResponse(errorType: QVerisCapabilityErrorType) {
  return errorType === "provider_response_read_failed" || errorType === "provider_empty_response";
}

function isEmptyProviderData(value: unknown) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  const record = asRecord(value);
  return Boolean(record && (Object.keys(record).length === 0 || Object.values(record).every(isEmptyProviderData)));
}

function pct(numerator?: number, denominator?: number) {
  return numerator != null && denominator ? numerator / denominator : undefined;
}

function parsePossiblyTruncated(value: unknown) {
  const record = asRecord(value);
  if (typeof record?.truncated_content === "string") {
    try {
      return JSON.parse(record.truncated_content);
    } catch {
      return null;
    }
  }
  return value;
}

async function hydrateFullContent(value: unknown) {
  const record = asRecord(value);
  const url = stringValue(record?.full_content_file_url);
  if (!url) return value;
  try {
    const hydrated = await fetchTrustedJson(new URL(url));
    return hydrated ?? value;
  } catch {
    return value;
  }
}

async function fetchTrustedJson(url: URL, redirects = 0): Promise<unknown | null> {
  if (!isTrustedFullContentUrl(url) || redirects > 3) return null;
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    return location ? fetchTrustedJson(new URL(location, url), redirects + 1) : null;
  }
  if (!res.ok || isOversize(res.headers.get("content-length"))) return null;
  const text = await readLimitedText(res);
  if (text == null) return null;
  return JSON.parse(text);
}

function isTrustedFullContentUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:"
    && (TRUSTED_FULL_CONTENT_HOSTS.has(host)
      || host.endsWith(".qveris.ai")
      || host.endsWith(".storage.googleapis.com")
      || host.endsWith(".r2.dev")
      || host.endsWith(".r2.cloudflarestorage.com")
      || host.endsWith(".blob.core.windows.net")
      || /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host)
      || host.endsWith(".s3.amazonaws.com"));
}

function isOversize(value: string | null) {
  return value != null && numberValue(value) != null && numberValue(value)! > MAX_FULL_CONTENT_BYTES;
}

async function readLimitedText(res: Response) {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FULL_CONTENT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function selectEstimate(rows: Record<string, unknown>[], event?: string | EarningsEvent | null) {
  const quarterly = rows.filter((row) => String(row.horizon ?? "").toLowerCase().includes("quarter"));
  const candidates = quarterly.length ? quarterly : rows;
  if (!event) return candidates[0] ?? null;
  if (typeof event === "object" && event) {
    return candidates.find((row) => estimateMatchesEvent(row, event)) ?? null;
  }
  return null;
}

function estimateMatchesEvent(row: Record<string, unknown>, event: EarningsEvent) {
  const eventQuarter = fiscalQuarter(event.fiscalPeriod);
  if (event.fiscalYear == null || eventQuarter == null) return false;
  return estimateFiscalYear(row) === event.fiscalYear && estimateFiscalQuarter(row) === eventQuarter;
}

function estimateFiscalYear(row: Record<string, unknown>) {
  return numberValue(row.fiscalYear)
    ?? numberValue(row.fiscal_year)
    ?? yearFromIsoDate(stringValue(row.fiscalDateEnding) ?? stringValue(row.fiscal_date_ending) ?? stringValue(row.date));
}

function estimateFiscalQuarter(row: Record<string, unknown>) {
  return fiscalQuarter(stringValue(row.fiscalPeriod) ?? stringValue(row.fiscal_period) ?? stringValue(row.period))
    ?? fiscalQuarter(stringValue(row.fiscalQuarter) ?? stringValue(row.fiscal_quarter))
    ?? fiscalQuarter(row.quarter == null ? undefined : `Q${row.quarter}`);
}

function normalizeFormType(value?: string): FilingItem["formType"] {
  if (value === "10-K" || value === "10-Q" || value === "8-K" || value === "DEF 14A") return value;
  return "other";
}

function isQuarterlyPeriod(value?: string) {
  return /^Q[1-4]$/i.test(value ?? "");
}

export function transcriptPeriod(event?: EarningsEvent | null) {
  const quarter = event?.fiscalPeriod?.match(/Q([1-4])/i)?.[1];
  return event?.fiscalYear && quarter ? { year: String(event.fiscalYear), quarter } : null;
}

function selectHistoricalPeriod(rows: HistoricalEarnings[], event?: EarningsEvent | null) {
  if (!event) return rows[0];
  return rows.find((row) => row.reportDate === event.reportDate && historicalFiscalYearMatches(row, event));
}

function historicalFiscalYearMatches(row: HistoricalEarnings, event: EarningsEvent) {
  if (event.fiscalYear == null) return true;
  return yearFromIsoDate(row.fiscalPeriod) === event.fiscalYear;
}

function yearFromIsoDate(value?: string) {
  const match = value?.match(/^(\d{4})-\d{2}-\d{2}$/);
  return match ? Number(match[1]) : undefined;
}

function fiscalQuarter(value?: string) {
  return value?.match(/Q([1-4])/i)?.[1];
}

export function extractGuidanceText(entries: Record<string, unknown>[]) {
  for (const entry of entries) {
    const content = stringValue(entry.content);
    if (!content) continue;
    const heading = /\b(?:now\s+)?turning to (?:our )?guidance\b/i.exec(content)
      ?? /\bbusiness outlook\b/i.exec(content);
    if (!heading) continue;
    const section = content.slice(heading.index).replace(/\s+/g, " ").trim();
    const epsSentence = /[^.!?]*(?:\bEPS\b|earnings per share)[^.!?]*[.!?]/i.exec(section);
    if (epsSentence) return section.slice(0, epsSentence.index + epsSentence[0].length).trim();
    return section.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 1200);
  }
  return undefined;
}

function toneFromText(text: string, keyword: string): TranscriptInsight["guidanceTone"] {
  const lower = text.toLowerCase();
  if (!lower.includes(keyword)) return "unavailable";
  if (/\b(strong|growth|accelerat|raise|raised|above)\b/.test(lower)) return "more_positive";
  if (/\b(weak|risk|uncertain|lower|below|slow)\b/.test(lower)) return "more_negative";
  return "unavailable";
}

function toneFromDirectionalEvidence(text: string): TranscriptInsight["managementTone"] {
  const lower = text.toLowerCase();
  if (!lower) return "unavailable";
  const positive = /\b(strong|growth|accelerat|raise|raised|above|improv|record)\b/.test(lower);
  const negative = /\b(weak|risk|uncertain|lower|below|slow|declin|pressure)\b/.test(lower);
  if (positive && !negative) return "more_positive";
  if (negative && !positive) return "more_negative";
  if (positive && negative) return "neutral";
  return "unavailable";
}

function extractAnalystQuestionTopics(entries: Record<string, unknown>[]) {
  const questions = entries.filter((entry) => transcriptRole(entry) === "analyst").map((entry) => stringValue(entry.content)).filter(Boolean).join("\n").toLowerCase();
  return TRANSCRIPT_TOPICS.filter(([, re]) => re.test(questions)).map(([label]) => label).slice(0, 5);
}

const TRANSCRIPT_TOPICS = [
  ["AI demand", /\b(ai|accelerator|gpu|data center)\b/],
  ["Margins", /\bmargin|gross margin|operating margin\b/],
  ["Guidance", /\bguidance|outlook|forecast\b/],
  ["Supply chain", /\bsupply|inventory|capacity\b/],
  ["China/export controls", /\bchina|export control|tariff\b/],
] as const;

function extractManagementAnswers(entries: Record<string, unknown>[], sourceIds: string[]) {
  return entries.flatMap((entry, index) => {
    if (transcriptRole(entry) !== "analyst") return [];
    const question = stringValue(entry.content) ?? "";
    const topic = TRANSCRIPT_TOPICS.find(([, re]) => re.test(question.toLowerCase()));
    if (!topic) return [];
    const [label, re] = topic;
    const answerEntry = entries.slice(index + 1).find((item) => {
      const role = transcriptRole(item);
      return role === "management" || role === "analyst";
    });
    if (!answerEntry || transcriptRole(answerEntry) !== "management") return [];
    const answer = sentenceAround(stringValue(answerEntry.content) ?? "", re) ?? firstSentence(stringValue(answerEntry.content) ?? "");
    return answer ? [{ topic: label, answer, sourceIds }] : [];
  }).slice(0, 4);
}

function transcriptRole(entry: Record<string, unknown>) {
  const explicit = [
    stringValue(entry.role),
    stringValue(entry.speaker_role),
    stringValue(entry.speakerRole),
    stringValue(entry.participant_role),
    stringValue(entry.participantRole),
  ].filter(Boolean).join(" ").toLowerCase();
  const explicitRole = roleFromText(explicit);
  if (explicitRole !== "unknown") return explicitRole;
  return roleFromText(`${stringValue(entry.speaker) ?? ""} ${stringValue(entry.name) ?? ""} ${stringValue(entry.title) ?? ""}`.toLowerCase());
}

function roleFromText(text: string) {
  if (/\b(analyst|questioner)\b/.test(text)) return "analyst";
  if (/\b(operator|moderator)\b/.test(text)) return "operator";
  if (/\b(management|executive|company|ceo|cfo|coo|president|officer|founder|chair)\b/.test(text)) return "management";
  return "unknown";
}

function sentenceAround(text: string, re: RegExp) {
  const sentence = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .find((item) => re.test(item.toLowerCase()));
  if (!sentence) return undefined;
  return sentence.length > 260 ? `${sentence.slice(0, 257).trim()}...` : sentence.trim();
}

function firstSentence(text: string) {
  const sentence = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)[0]?.trim();
  if (!sentence) return undefined;
  return sentence.length > 260 ? `${sentence.slice(0, 257).trim()}...` : sentence;
}
