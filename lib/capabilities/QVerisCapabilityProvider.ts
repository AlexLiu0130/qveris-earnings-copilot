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

const DEFAULT_BASE_URL = "https://qveris.ai/api/v1";
const CALENDAR_TOOL_ID = "finnhub.calendar.earnings.retrieve.v1.0e57aadf";
const PROFILE_TOOL_ID = "finnhub.company.profile.v2.get.v1";
const EARNINGS_HISTORY_TOOL_ID = "alphavantage.earnings.retrieve.v1.7aca3c4a";
const ESTIMATES_TOOL_ID = "alphavantage.earnings_estimates.retrieve.v1.7aca3c4a";
const QUOTE_TOOL_ID = "eodhd.live_v2.us_quote_delayed.retrieve.v1.f0e13d45";
const HISTORICAL_PRICE_TOOL_ID = "alphavantage.time-series.daily-adjusted.v1";
const NEWS_TOOL_ID = "qveris_finance.finance_news_aggregation_v1";
const FILINGS_TOOL_ID = "finnhub.stock.filings.retrieve.v1.27aa1125";
const TRANSCRIPT_TOOL_ID = "alphavantage.earnings_call_transcript.query.v1.467a92c0";
const INCOME_STATEMENT_TOOL_ID = "financialmodelingprep.stable.incomestatement.retrieve.v1.dd6d583f";
const BALANCE_SHEET_TOOL_ID = "financialmodelingprep.stable.balancesheetstatement.retrieve.v1.bce203b1";
const CASH_FLOW_TOOL_ID = "financialmodelingprep.stable.cashflowstatement.retrieve.v1.dfeb9354";
const REVENUE_SEGMENT_TOOL_ID = "financialmodelingprep.stable.revenueproductsegmentation.retrieve.v1.8faa287f";

export class QVerisCapabilityProvider implements EarningsCapabilityProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly sourceRefs = new Map<string, SourceRef>();
  private readonly executions = new Map<string, Promise<{ data: unknown; executionId?: string; success: boolean }>>();

  constructor(options: { baseUrl?: string; apiKey?: string } = {}) {
    const env = localEnv();
    this.baseUrl = (options.baseUrl ?? env.QVERIS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = options.apiKey ?? env.QVERIS_API_KEY;
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
    if (!this.apiKey) return [];
    const allowedSymbols = calendarSymbolsForUniverse(params.universe);
    const today = todayIso();
    const ranges = calendarRanges(params.from, params.to);
    const rows = await Promise.all(ranges.map((range) => this.execute(CALENDAR_TOOL_ID, range)));
    const seen = new Set<string>();
    return rows.flatMap((payload) => {
      const events = asRecord(payload.data)?.earningsCalendar;
      if (!Array.isArray(events)) return [];
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

  async getEarningsEstimates(ticker: string, eventId?: string): Promise<EarningsEstimates | null> {
    const call = await this.execute(ESTIMATES_TOOL_ID, { symbol: ticker, function: "EARNINGS_ESTIMATES" });
    const data = parsePossiblyTruncated(call.data);
    const estimates = Array.isArray(asRecord(data)?.estimates) ? asRecord(data)!.estimates as Record<string, unknown>[] : [];
    const selected = selectEstimate(estimates, eventId);
    if (!selected) return null;
    const sourceId = this.recordSource(ticker, "get_earnings_estimates", "QVeris consensus estimates", ESTIMATES_TOOL_ID, call.executionId);
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

    return incomeRows.slice(0, limit).map((income) => {
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
    return arrayRecords(call.data).slice(0, limit).map((row) => {
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
    const to = params.to ?? todayIso();
    const from = params.from ?? addDaysIso(to, -365);
    const call = await this.execute(FILINGS_TOOL_ID, { symbol: ticker, from, to });
    const rows = Array.isArray(call.data) ? call.data as Record<string, unknown>[] : [];
    const sourceId = this.recordSource(ticker, "get_sec_filings", "QVeris SEC filings", FILINGS_TOOL_ID, call.executionId);
    const filings = rows.map((row, index): FilingItem => ({
      id: stringValue(row.accessNumber) ?? `${ticker.toUpperCase()}-filing-${index}`,
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
    return {
      available: true,
      managementTone: "neutral",
      guidanceTone: toneFromText(content, "guidance"),
      riskLanguage: content.toLowerCase().includes("risk") ? "unchanged" : "unavailable",
      repeatedQuestions: extractQuestionTopics(content),
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
    return execution;
  }

  private async executeOnce(toolId: string, parameters: Record<string, unknown>): Promise<{ data: unknown; executionId?: string; success: boolean }> {
    if (!this.apiKey) return { data: null, success: false };
    try {
      const res = await fetch(`${this.baseUrl}/tools/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ tool_id: toolId, parameters }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { data: null, success: false };
      const payload = await res.json();
      const data = await hydrateFullContent(payload?.result?.data ?? payload?.result ?? null);
      return { data, executionId: payload?.execution_id, success: Boolean(payload?.success) };
    } catch {
      return { data: null, success: false };
    }
  }
}

function normalizeTiming(raw: unknown): EarningsEvent["timing"] {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("bmo") || value.includes("before")) return "before_open";
  if (value.includes("amc") || value.includes("after")) return "after_close";
  return "unknown";
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
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return value;
    return await res.json();
  } catch {
    return value;
  }
}

export function selectEstimate(rows: Record<string, unknown>[], eventId?: string) {
  const eventDate = eventId?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const quarterly = rows.filter((row) => String(row.horizon ?? "").toLowerCase().includes("quarter"));
  const candidates = quarterly.length ? quarterly : rows;
  if (!eventDate) return candidates[0] ?? null;
  const dated = candidates
    .map((row) => ({ row, date: stringValue(row.date) }))
    .filter((item): item is { row: Record<string, unknown>; date: string } => Boolean(item.date));
  return dated
    .filter((item) => item.date <= eventDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.row
    ?? dated.filter((item) => item.date > eventDate).sort((a, b) => a.date.localeCompare(b.date))[0]?.row
    ?? candidates[0]
    ?? null;
}

function normalizeFormType(value?: string): FilingItem["formType"] {
  if (value === "10-K" || value === "10-Q" || value === "8-K" || value === "DEF 14A") return value;
  return "other";
}

export function transcriptPeriod(event?: EarningsEvent | null) {
  const quarter = event?.fiscalPeriod?.match(/Q([1-4])/i)?.[1];
  return event?.fiscalYear && quarter ? { year: String(event.fiscalYear), quarter } : null;
}

function selectHistoricalPeriod(rows: HistoricalEarnings[], event?: EarningsEvent | null) {
  if (!event) return rows[0];
  return rows.find((row) => row.reportDate === event.reportDate);
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
  return "neutral";
}

function extractQuestionTopics(text: string) {
  const lower = text.toLowerCase();
  return TRANSCRIPT_TOPICS.filter(([, re]) => re.test(lower)).map(([label]) => label).slice(0, 5);
}

const TRANSCRIPT_TOPICS = [
  ["AI demand", /\b(ai|accelerator|gpu|data center)\b/],
  ["Margins", /\bmargin|gross margin|operating margin\b/],
  ["Guidance", /\bguidance|outlook|forecast\b/],
  ["Supply chain", /\bsupply|inventory|capacity\b/],
  ["China/export controls", /\bchina|export control|tariff\b/],
] as const;

function extractManagementAnswers(entries: Record<string, unknown>[], sourceIds: string[]) {
  return TRANSCRIPT_TOPICS.flatMap(([topic, re]) => {
    const entry = entries.find((item) => {
      const content = stringValue(item.content);
      if (!content || !re.test(content.toLowerCase())) return false;
      const speaker = `${stringValue(item.speaker) ?? ""} ${stringValue(item.name) ?? ""} ${stringValue(item.title) ?? ""}`.toLowerCase();
      return !/\b(analyst|operator|moderator)\b/.test(speaker);
    });
    const answer = entry ? sentenceAround(stringValue(entry.content) ?? "", re) : undefined;
    return answer ? [{ topic, answer, sourceIds }] : [];
  }).slice(0, 4);
}

function sentenceAround(text: string, re: RegExp) {
  const sentence = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .find((item) => re.test(item.toLowerCase()));
  if (!sentence) return undefined;
  return sentence.length > 260 ? `${sentence.slice(0, 257).trim()}...` : sentence.trim();
}
