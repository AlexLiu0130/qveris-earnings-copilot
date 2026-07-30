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
import { calendarSymbolsForUniverse, isCoreCalendarUniverse, recentHistorySymbolsForUniverse } from "@/lib/earnings/universe";
import { filterRelevantNews, selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import { readQVerisFetchCache, writeQVerisFetchCache } from "@/lib/capabilities/qverisFetchCache";
import { QVERIS_EARNINGS_TOOL_IDS } from "@/lib/capabilities/qverisEarningsTools";

const DEFAULT_BASE_URL = "https://qveris.ai/api/v1";
const {
  calendar: CALENDAR_TOOL_ID,
  consensusCalendar: CONSENSUS_CALENDAR_TOOL_ID,
  earningsHistory: EARNINGS_HISTORY_TOOL_ID,
  earningsDates: EARNINGS_DATES_TOOL_ID,
  indexConstituents: INDEX_CONSTITUENTS_TOOL_ID,
  secCompanySubmissions: SEC_COMPANY_SUBMISSIONS_TOOL_ID,
  profile: PROFILE_TOOL_ID,
  marketCapBatch: MARKET_CAP_BATCH_TOOL_ID,
  quote: QUOTE_TOOL_ID,
  historicalPrice: HISTORICAL_PRICE_TOOL_ID,
  news: NEWS_TOOL_ID,
  filingsCik: FILINGS_CIK_TOOL_ID,
  filingsSearch: FILINGS_SEARCH_TOOL_ID,
  transcript: TRANSCRIPT_TOOL_ID,
  incomeStatement: INCOME_STATEMENT_TOOL_ID,
  balanceSheet: BALANCE_SHEET_TOOL_ID,
  cashFlow: CASH_FLOW_TOOL_ID,
  revenueSegment: REVENUE_SEGMENT_TOOL_ID,
} = QVERIS_EARNINGS_TOOL_IDS;
const RAW_CACHE_NAMESPACE_VERSION = 2;
const CORE_ADR_SUBMISSIONS = {
  ASML: { cik: "0000937966" },
  TSM: { cik: "0001046179" },
} as const;
const TSM_Q2_2026_IR_EVENT = {
  ticker: "TSM",
  reportDate: "2026-07-16",
  fiscalPeriod: "Q2",
  fiscalYear: 2026,
  url: "https://investor.tsmc.com/english/quarterly-results/2026/q2",
} as const;
const TSM_Q2_2026_IR_RESULTS = {
  reportDate: "2026-07-16",
  fiscalPeriod: "Q2",
  fiscalYear: 2026,
  revenueGuidanceMidpointTwd: 1_255_320_000_000,
  guidanceText: "Q3 2026 net revenue is expected between $44.6 billion and $45.8 billion, with gross margin between 65% and 67% and operating margin between 56% and 58%.",
  url: "https://investor.tsmc.com/english/quarterly-results/2026/q2",
} as const;
const ASML_Q2_2026_IR_RESULTS = {
  reportDate: "2026-07-15",
  fiscalPeriod: "Q2",
  fiscalYear: 2026,
  epsActual: 7.59,
  guidanceText: "Q3 2026 total net sales are expected between €11.0 billion and €12.0 billion, with gross margin between 55% and 57%. Full-year 2026 total net sales are expected between €43 billion and €45 billion, with gross margin between 54% and 56%.",
  url: "https://www.asml.com/en/news/press-releases/2026/q2-2026-financial-results",
} as const;
const ASML_Q2_2026_IR_EVENT = {
  ticker: "ASML",
  reportDate: "2026-07-15",
  fiscalPeriod: "Q2",
  fiscalYear: 2026,
  url: ASML_Q2_2026_IR_RESULTS.url,
} as const;
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

  async getMarketCaps(tickers: string[]) {
    const unique = [...new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean))].sort();
    const chunks = Array.from({ length: Math.ceil(unique.length / 50) }, (_, index) => unique.slice(index * 50, (index + 1) * 50));
    const calls = await Promise.allSettled(chunks.map((symbols) => this.execute(MARKET_CAP_BATCH_TOOL_ID, { symbols: symbols.join(",") })));
    return new Map(calls.flatMap((call) => call.status === "fulfilled" ? arrayRecords(call.value.data).flatMap((row) => {
      const symbol = stringValue(row.symbol)?.toUpperCase();
      const marketCap = numberValue(row.marketCap);
      return symbol && marketCap != null ? [[symbol, marketCap] as const] : [];
    }) : []));
  }

  async getEarningsCalendar(params: EarningsCalendarParams): Promise<EarningsEvent[]> {
    const today = todayIso();
    const [payload, allowedSymbols] = await Promise.all([
      this.execute(CALENDAR_TOOL_ID, { function: "EARNINGS_CALENDAR", horizon: "3month" }),
      this.getCalendarUniverseSymbols(params.universe),
    ]);
    const rows = calendarRows(payload.data);
    if (!rows) throw new QVerisCapabilityError(CALENDAR_TOOL_ID, "business_error", undefined, "QVeris calendar payload missing earningsCalendar array or CSV rows");
    const seen = new Set<string>();
    const primaryEvents = rows
        .filter((event): event is Record<string, unknown> => Boolean(asRecord(event)?.date))
        .filter((event) => String(event.date) >= params.from && String(event.date) <= params.to)
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
          const fiscal = fiscalQuarterFromQuarterEnd(String(event.fiscalDateEnding ?? ""));
          return {
            id: `${ticker}-${event.date}`,
            ticker,
            fiscalPeriod: event.quarter ? `Q${event.quarter}` : fiscal?.period,
            fiscalYear: event.year ? Number(event.year) : fiscal?.year,
            reportDate: String(event.date),
            timing: normalizeTiming(event.hour ?? event.timeOfTheDay),
            status: normalizeStatus(event, today),
            revenueActual: numberValue(event.revenueActual),
            epsActual: numberValue(event.epsActual),
            revenueEstimate: numberValue(event.revenueEstimate),
            epsEstimate: numberValue(event.epsEstimate ?? event.estimate),
            sourceIds: [sourceId],
          };
        });
    const [adrSupplements, recentCalendarSupplements, historySupplements] = await Promise.all([
      this.getCoreAdrCalendarSupplements(params, allowedSymbols),
      params.from <= today && isCoreCalendarUniverse(params.universe)
        ? this.getRecentCalendarSupplements(params, allowedSymbols)
        : Promise.resolve([]),
      params.from <= today ? this.getRecentHistoryCalendarSupplements(params) : Promise.resolve([]),
    ]);
    return mergeCalendarEvents(primaryEvents, [...adrSupplements, ...recentCalendarSupplements, ...historySupplements]);
  }

  private async getCalendarUniverseSymbols(universe?: string) {
    const fallback = calendarSymbolsForUniverse(universe);
    const normalized = universe?.trim().toLowerCase();
    if (normalized === "all" || normalized === "hot_small_caps" || normalized === "small_caps") return fallback;
    if (normalized && !["core", "popular", "sp500", "nasdaq"].includes(normalized)) return fallback;
    const queries = normalized === "sp500"
      ? ["S&P 500 index constituents, include all ticker symbols"]
      : normalized === "nasdaq"
        ? ["Nasdaq 100 index constituents, include all ticker symbols"]
        : ["S&P 500 index constituents, include all ticker symbols", "Nasdaq 100 index constituents, include all ticker symbols"];
    const calls = await Promise.allSettled(queries.map((query) => this.execute(INDEX_CONSTITUENTS_TOOL_ID, { query })));
    const symbols = calls.flatMap((call) => call.status === "fulfilled" ? indexConstituentSymbols(call.value.data) : []);
    if (!symbols.length) return fallback;
    return [...new Set(normalized === "sp500" || normalized === "nasdaq" ? symbols : [...symbols, ...(fallback ?? [])])];
  }

  private async getRecentHistoryCalendarSupplements(params: EarningsCalendarParams): Promise<EarningsEvent[]> {
    const results = await Promise.allSettled(
      recentHistorySymbolsForUniverse(params.universe).map(async (ticker) => {
        const history = await this.getHistoricalEarnings(ticker, 2);
        return history.flatMap((item): EarningsEvent[] => {
          if (item.reportDate < params.from || item.reportDate > params.to) return [];
          const fiscal = fiscalQuarterFromQuarterEnd(item.fiscalPeriod ?? "");
          return [{
            id: `${ticker}-${item.reportDate}`,
            ticker,
            reportDate: item.reportDate,
            fiscalPeriod: fiscal?.period,
            fiscalYear: fiscal?.year,
            timing: "unknown",
            status: "reported",
            epsActual: item.epsActual,
            epsEstimate: item.epsEstimate,
            sourceIds: item.sourceIds,
          }];
        });
      }),
    );
    return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  }

  private async getRecentCalendarSupplements(params: EarningsCalendarParams, allowedSymbols: string[] | null) {
    const today = todayIso();
    const from = params.from > addDaysIso(today, -30) ? params.from : addDaysIso(today, -30);
    const to = params.to < today ? params.to : today;
    if (from > to) return [];
    const dates = isoDates(from, to);
    const calls = [];
    for (let index = 0; index < dates.length; index += 8) {
      calls.push(...await Promise.allSettled(dates.slice(index, index + 8).map((date) =>
        this.execute(CONSENSUS_CALENDAR_TOOL_ID, { from: date, to: date }))));
    }
    return calls.flatMap((result): EarningsEvent[] => {
      if (result.status !== "fulfilled") return [];
      const rows = calendarRows(result.value.data);
      if (!rows) return [];
      return rows.flatMap((row): EarningsEvent[] => {
        const ticker = stringValue(row.symbol)?.toUpperCase();
        const reportDate = stringValue(row.date);
        if (!ticker || !reportDate || (allowedSymbols && !allowedSymbols.includes(ticker))) return [];
        const sourceId = this.recordSource(
          ticker,
          "get_recent_earnings_calendar",
          "QVeris recent earnings calendar",
          CONSENSUS_CALENDAR_TOOL_ID,
          result.value.executionId,
        );
        return [{
          id: `${ticker}-${reportDate}`,
          ticker,
          reportDate,
          fiscalPeriod: estimateFiscalQuarter(row) ? `Q${estimateFiscalQuarter(row)}` : undefined,
          fiscalYear: numberValue(row.year),
          timing: normalizeTiming(row.hour),
          status: "reported",
          revenueActual: numberValue(row.revenueActual),
          revenueEstimate: numberValue(row.revenueEstimate),
          epsActual: numberValue(row.epsActual),
          epsEstimate: numberValue(row.epsEstimate),
          sourceIds: [sourceId],
        }];
      });
    });
  }

  async getEarningsEstimates(ticker: string, event?: string | EarningsEvent | null): Promise<EarningsEstimates | null> {
    if (typeof event === "string") return null;
    const eventEstimate = event && (event.revenueEstimate != null || event.epsEstimate != null)
      ? {
          revenueEstimate: event.revenueEstimate,
          epsEstimate: event.epsEstimate,
          sourceIds: event.sourceIds,
        }
      : null;
    const call = eventEstimate?.revenueEstimate != null && eventEstimate.epsEstimate != null
      ? null
      : await this.getConsensusCalendarRow(ticker, event).catch(() => null);
    const selected = call?.row;
    const officialTsm = typeof event === "object" ? tsmOfficialResults(ticker, event) : null;
    const historical = eventEstimate?.epsEstimate == null && numberValue(selected?.epsEstimate) == null && event
      ? selectHistoricalPeriod(await this.getHistoricalEarnings(ticker, 4), event)
      : null;
    if (!eventEstimate && !selected && !historical && !officialTsm) return null;
    const sourceId = selected
      ? this.recordSource(ticker, "get_earnings_estimates", "QVeris consensus earnings calendar", CONSENSUS_CALENDAR_TOOL_ID, call?.executionId)
      : undefined;
    const officialSourceId = officialTsm
      ? this.recordSource(ticker, "get_official_quarterly_results", "TSMC official quarterly results", "tsmc.investor-relations.quarterly-results", undefined, { provider: "TSMC Investor Relations", url: officialTsm.url })
      : undefined;
    const providerRevenue = eventEstimate?.revenueEstimate ?? numberValue(selected?.revenueEstimate);
    const revenueEstimate = providerRevenue ?? officialTsm?.revenueGuidanceMidpointTwd;
    const epsEstimate = eventEstimate?.epsEstimate ?? numberValue(selected?.epsEstimate) ?? historical?.epsEstimate;
    const eventId = event?.id;
    const revenueSourceIds = eventEstimate?.revenueEstimate != null
      ? eventEstimate.sourceIds
      : numberValue(selected?.revenueEstimate) != null && sourceId ? [sourceId] : [];
    const epsSourceIds = eventEstimate?.epsEstimate != null
      ? eventEstimate.sourceIds
      : numberValue(selected?.epsEstimate) != null && sourceId ? [sourceId] : historical?.sourceIds ?? [];
    return {
      ticker: ticker.toUpperCase(),
      eventId,
      revenueEstimate,
      epsEstimate,
      epsCurrency: officialTsm ? "USD" : undefined,
      revenueEstimateBasis: providerRevenue != null ? "consensus" : "company_guidance_midpoint",
      sourceIds: [...new Set([...revenueSourceIds, ...epsSourceIds, officialSourceId].filter(Boolean) as string[])],
      fieldSourceIds: {
        revenueEstimate: providerRevenue != null ? revenueSourceIds : officialSourceId ? [officialSourceId] : undefined,
        epsEstimate: epsEstimate != null ? epsSourceIds : undefined,
      },
    };
  }

  async getEarningsResults(ticker: string, event?: EarningsEvent | null): Promise<EarningsResults | null> {
    const [history, financials, segments, transcript] = await Promise.all([
      this.getHistoricalEarnings(ticker, 8),
      this.getFinancialStatements(ticker, 8),
      this.getRevenueSegments(ticker, 4).catch(() => []),
      this.getTranscriptEntries(ticker, event).catch(() => ({ entries: [], executionId: undefined })),
    ]);
    const latest = selectHistoricalPeriod(history, event);
    const latestFinancials = selectFiscalPeriod(financials, event);
    const latestSegments = selectFiscalPeriod(segments, event);
    const transcriptGuidance = extractGuidanceText(transcript.entries);
    const officialAsml = asmlOfficialResults(ticker, event);
    const officialTsm = tsmOfficialResults(ticker, event);
    const officialResult = officialAsml ?? officialTsm;
    const officialSourceId = officialResult
      ? this.recordSource(ticker, "get_official_quarterly_results", `${ticker.toUpperCase()} official quarterly results`, `${ticker.toLowerCase()}.investor-relations.quarterly-results`, undefined, { provider: `${ticker.toUpperCase()} Investor Relations`, url: officialResult.url })
      : undefined;
    const guidanceText = officialResult?.guidanceText ?? transcriptGuidance;
    const calendarSourceIds = event?.sourceIds ?? [];
    const revenueSourceIds = latestFinancials?.revenue != null
      ? latestFinancials.fieldSourceIds?.revenue ?? latestFinancials.sourceIds
      : calendarSourceIds;
    const epsSourceIds = officialAsml && officialSourceId ? [officialSourceId] : event?.epsActual != null ? calendarSourceIds : latest?.sourceIds;
    const guidanceSourceIds = officialSourceId
      ? [officialSourceId]
      : transcriptGuidance
        ? [this.recordSource(ticker, "get_earnings_guidance", "QVeris prepared earnings guidance", TRANSCRIPT_TOOL_ID, transcript.executionId)]
        : undefined;
    if (event?.revenueActual == null && event?.epsActual == null && !latest && !latestFinancials) return null;
    return {
      ticker: ticker.toUpperCase(),
      eventId: event?.id,
      revenueActual: latestFinancials?.revenue ?? event?.revenueActual,
      epsActual: officialAsml?.epsActual ?? event?.epsActual ?? latest?.epsActual,
      epsCurrency: officialTsm ? "USD" : undefined,
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
        grossMargin: latestFinancials?.fieldSourceIds?.grossMargin ?? latestFinancials?.sourceIds,
        operatingMargin: latestFinancials?.fieldSourceIds?.operatingMargin ?? latestFinancials?.sourceIds,
        netIncome: latestFinancials?.fieldSourceIds?.netIncome ?? latestFinancials?.sourceIds,
        guidanceText: guidanceSourceIds,
        segmentHighlights: latestSegments?.sourceIds,
      },
    };
  }

  async getHistoricalEarnings(ticker: string, limit = 8): Promise<HistoricalEarnings[]> {
    const [call, dateCall] = await Promise.all([
      this.execute(EARNINGS_HISTORY_TOOL_ID, { symbol: ticker, limit }),
      this.execute(EARNINGS_DATES_TOOL_ID, { symbol: ticker, outputsize: limit, format: "JSON" }).catch(() => null),
    ]);
    const rows = arrayRecords(call.data);
    const sourceId = this.recordSource(ticker, "get_historical_earnings", "QVeris earnings history", EARNINGS_HISTORY_TOOL_ID, call.executionId);
    const dateRows = arrayRecords(asRecord(dateCall?.data)?.earnings)
      .filter((row) => numberValue(row.eps_actual) != null);
    const dateSourceId = dateCall
      ? this.recordSource(ticker, "get_earnings_dates", "QVeris earnings report dates", EARNINGS_DATES_TOOL_ID, dateCall.executionId)
      : undefined;
    return rows.slice(0, limit).map((row, index) => {
      const fiscalPeriod = stringValue(row.period);
      const reportDate = closestReportDate(fiscalPeriod, dateRows) ?? fiscalPeriod ?? todayIso();
      const epsActual = numberValue(row.actual);
      const epsEstimate = numberValue(row.estimate);
      return {
        eventId: `${ticker.toUpperCase()}-earnings-${fiscalPeriod ?? index}`,
        fiscalPeriod,
        reportDate,
        epsActual,
        epsEstimate,
        sourceIds: [...new Set([sourceId, reportDate !== fiscalPeriod ? dateSourceId : undefined].filter(Boolean) as string[])],
        fieldSourceIds: {
          epsActual: epsActual != null ? [sourceId] : undefined,
          epsEstimate: epsEstimate != null ? [sourceId] : undefined,
        },
      };
    });
  }

  private async getConsensusCalendarRow(ticker: string, event?: EarningsEvent | null) {
    const from = event?.reportDate ?? addDaysIso(todayIso(), -7);
    const to = event?.reportDate ?? addDaysIso(todayIso(), 120);
    const call = await this.execute(CONSENSUS_CALENDAR_TOOL_ID, { from, to, symbol: ticker });
    const rows = calendarRows(call.data) ?? [];
    const row = rows.find((item) => !event || (
      stringValue(item.date) === event.reportDate
      && (!event.fiscalYear || numberValue(item.year) === event.fiscalYear)
      && (!event.fiscalPeriod || estimateFiscalQuarter(item) === fiscalQuarter(event.fiscalPeriod))
    ));
    return row ? { row, executionId: call.executionId } : null;
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
      from: params.from,
      to: params.to,
    });
    const sourceId = this.recordSource(ticker, "get_historical_prices", "QVeris adjusted daily prices", HISTORICAL_PRICE_TOOL_ID, call.executionId);
    return arrayRecords(call.data)
      .flatMap((row): PriceBar[] => {
        const date = stringValue(row.date);
        const close = numberValue(row.adjClose);
        if (!date || close == null) return [];
        return [{
          date,
          open: numberValue(row.adjOpen),
          close,
          volume: numberValue(row.volume),
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
        fieldSourceIds: {
          revenue: revenue != null ? [incomeSource] : undefined,
          grossMargin: grossProfit != null && revenue != null ? [incomeSource] : undefined,
          operatingMargin: operatingIncome != null && revenue != null ? [incomeSource] : undefined,
          netIncome: numberValue(income.netIncome) != null ? [incomeSource] : undefined,
        },
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

  private async getCoreAdrCalendarSupplements(params: EarningsCalendarParams, allowedSymbols: string[] | null) {
    const symbols = coreAdrSymbolsForCalendar(allowedSymbols);
    const events: EarningsEvent[] = [];
    for (const symbol of symbols) {
      try {
        events.push(...await this.getSecAdrCalendarEvents(symbol, params));
      } catch {
        console.error("QVeris ADR submissions supplement failed", symbol);
      }
    }
    if (symbols.includes("ASML")) events.push(...this.getAsmlOfficialCalendarEvents(params));
    if (symbols.includes("TSM")) events.push(...this.getTsmOfficialCalendarEvents(params));
    return events;
  }

  private async getSecAdrCalendarEvents(symbol: keyof typeof CORE_ADR_SUBMISSIONS, params: EarningsCalendarParams) {
    const call = await this.execute(SEC_COMPANY_SUBMISSIONS_TOOL_ID, { cik: CORE_ADR_SUBMISSIONS[symbol].cik });
    return secSubmissionRows(call.data).flatMap((row): EarningsEvent[] => {
      const filingDate = stringValue(row.filingDate);
      const reportDate = stringValue(row.reportDate);
      if (!filingDate || !reportDate || filingDate < params.from || filingDate > params.to) return [];
      if (!isCoreAdrQuarterly6K(symbol, row)) return [];
      const fiscal = fiscalQuarterFromQuarterEnd(reportDate);
      if (!fiscal) return [];
      const accession = stringValue(row.accessionNumber);
      const primaryDocument = stringValue(row.primaryDocument);
      const sourceId = this.recordSource(
        symbol,
        `get_sec_quarterly_filing_${accession ?? filingDate}`,
        `${symbol} quarterly 6-K via QVeris`,
        SEC_COMPANY_SUBMISSIONS_TOOL_ID,
        call.executionId,
        { url: secFilingUrl(CORE_ADR_SUBMISSIONS[symbol].cik, accession, primaryDocument) },
      );
      return [{
        id: `${symbol}-${filingDate}`,
        ticker: symbol,
        fiscalPeriod: fiscal.period,
        fiscalYear: fiscal.year,
        reportDate: filingDate,
        timing: "unknown",
        status: "reported",
        sourceIds: [sourceId],
      }];
    });
  }

  private getTsmOfficialCalendarEvents(params: EarningsCalendarParams) {
    if (TSM_Q2_2026_IR_EVENT.reportDate < params.from || TSM_Q2_2026_IR_EVENT.reportDate > params.to) return [];
    const sourceId = this.recordSource(
      "TSM",
      "official_ir_calendar",
      "TSMC official IR earnings calendar",
      "tsmc.investor-relations.quarterly-results",
      undefined,
      { provider: "TSMC Investor Relations", url: TSM_Q2_2026_IR_EVENT.url },
    );
    return [{
      id: "TSM-2026-07-16",
      ticker: "TSM",
      fiscalPeriod: TSM_Q2_2026_IR_EVENT.fiscalPeriod,
      fiscalYear: TSM_Q2_2026_IR_EVENT.fiscalYear,
      reportDate: TSM_Q2_2026_IR_EVENT.reportDate,
      timing: "before_open" as const,
      status: "reported" as const,
      sourceIds: [sourceId],
    }];
  }

  private getAsmlOfficialCalendarEvents(params: EarningsCalendarParams) {
    if (ASML_Q2_2026_IR_EVENT.reportDate < params.from || ASML_Q2_2026_IR_EVENT.reportDate > params.to) return [];
    const sourceId = this.recordSource(
      "ASML",
      "official_ir_calendar",
      "ASML official IR earnings calendar",
      "asml.investor-relations.quarterly-results",
      undefined,
      { provider: "ASML Investor Relations", url: ASML_Q2_2026_IR_EVENT.url },
    );
    return [{
      id: `ASML-${ASML_Q2_2026_IR_EVENT.reportDate}`,
      ticker: "ASML",
      reportDate: ASML_Q2_2026_IR_EVENT.reportDate,
      fiscalPeriod: ASML_Q2_2026_IR_EVENT.fiscalPeriod,
      fiscalYear: ASML_Q2_2026_IR_EVENT.fiscalYear,
      timing: "before_open" as const,
      status: "reported" as const,
      sourceIds: [sourceId],
    }];
  }

  private recordSource(ticker: string, capability: string, title: string, toolId: string, executionId?: string, options: { provider?: string; url?: string } = {}) {
    const id = `${ticker.toUpperCase()}-qveris-${capability}`;
    this.sourceRefs.set(id, {
      id,
      title,
      provider: options.provider ?? "QVeris",
      retrievedAt: new Date().toISOString(),
      capability,
      executionId,
      url: options.url,
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
      const data = await hydrateFullContent(payload?.result?.data ?? payload?.result ?? null, this.baseUrl);
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
  if (value.includes("bmo") || value.includes("before") || value.includes("pre-market")) return "before_open";
  if (value.includes("amc") || value.includes("after") || value.includes("post-market")) return "after_close";
  return "unknown";
}

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoDates(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDaysIso(date, 1)) dates.push(date);
  return dates;
}

function calendarRows(value: unknown): Record<string, unknown>[] | null {
  const legacy = asRecord(value)?.earningsCalendar;
  if (Array.isArray(legacy)) return arrayRecords(legacy);
  if (typeof value !== "string") return null;
  const rows = parseCsv(value);
  if (!rows.length || !("symbol" in rows[0]) || !("reportDate" in rows[0])) return null;
  return rows.map((row) => ({ ...row, date: row.reportDate }));
}

function indexConstituentSymbols(value: unknown) {
  const results = asRecord(value)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((result) => {
    const markdown = stringValue(asRecord(result)?.table_markdown);
    if (!markdown) return [];
    return markdown.split("\n").flatMap((line) => {
      const symbol = line.split("|")[3]?.trim();
      return symbol && !symbol.includes("股票代码") && !symbol.startsWith("---")
        ? [symbol.replace(/\.(?:NY|N)$/i, "").toUpperCase()]
        : [];
    });
  });
}

function parseCsv(value: string) {
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '"' && quoted && value[index + 1] === '"') {
      field += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && value[index + 1] === "\n") index++;
      row.push(field);
      if (row.some(Boolean)) table.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(Boolean)) table.push(row);
  const [headers, ...rows] = table;
  if (!headers?.length) return [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function normalizeStatus(event: Record<string, unknown>, today: string): EarningsEvent["status"] {
  const rawStatus = String(event.status ?? "").toLowerCase();
  if (rawStatus === "reported" || rawStatus === "upcoming" || rawStatus === "unknown") return rawStatus;
  const date = String(event.date ?? "");
  if (event.epsActual != null || event.revenueActual != null || event.actual != null) return "reported";
  return calendarStatusForDate(date, today);
}

function calendarStatusForDate(date: string, today: string): EarningsEvent["status"] {
  if (date < today) return "reported";
  return "upcoming";
}

function coreAdrSymbolsForCalendar(allowedSymbols: string[] | null): Array<keyof typeof CORE_ADR_SUBMISSIONS> {
  if (allowedSymbols === null) return ["ASML", "TSM"];
  const allowed = new Set(allowedSymbols);
  return (Object.keys(CORE_ADR_SUBMISSIONS) as Array<keyof typeof CORE_ADR_SUBMISSIONS>).filter((symbol) => allowed.has(symbol));
}

function asmlOfficialResults(ticker: string, event?: EarningsEvent | null) {
  return ticker.toUpperCase() === "ASML"
    && event?.reportDate === ASML_Q2_2026_IR_RESULTS.reportDate
    && event.fiscalPeriod === ASML_Q2_2026_IR_RESULTS.fiscalPeriod
    && event.fiscalYear === ASML_Q2_2026_IR_RESULTS.fiscalYear
    ? ASML_Q2_2026_IR_RESULTS
    : null;
}

function tsmOfficialResults(ticker: string, event?: EarningsEvent | null) {
  return ticker.toUpperCase() === "TSM"
    && event?.reportDate === TSM_Q2_2026_IR_RESULTS.reportDate
    && event.fiscalPeriod === TSM_Q2_2026_IR_RESULTS.fiscalPeriod
    && event.fiscalYear === TSM_Q2_2026_IR_RESULTS.fiscalYear
    ? TSM_Q2_2026_IR_RESULTS
    : null;
}

function mergeCalendarEvents(primary: EarningsEvent[], supplements: EarningsEvent[]) {
  const seen = new Set(primary.map((event) => `${event.ticker}-${event.reportDate}`));
  return [
    ...primary,
    ...supplements.filter((event) => {
      const key = `${event.ticker}-${event.reportDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

function secSubmissionRows(value: unknown): Record<string, unknown>[] {
  const data = asRecord(value);
  const recentValue = asRecord(data?.filings)?.recent ?? data?.recent ?? value;
  if (Array.isArray(recentValue)) return arrayRecords(recentValue);
  const recent = asRecord(recentValue);
  if (!recent) return [];
  const max = Math.max(...Object.values(recent).map((item) => Array.isArray(item) ? item.length : 0));
  if (!Number.isFinite(max) || max <= 0) return arrayRecords(recent);
  return Array.from({ length: max }, (_, index) => Object.fromEntries(
    Object.entries(recent).map(([key, item]) => [key, Array.isArray(item) ? item[index] : item]),
  ));
}

function isCoreAdrQuarterly6K(symbol: keyof typeof CORE_ADR_SUBMISSIONS, row: Record<string, unknown>) {
  if (String(row.form ?? "").toUpperCase() !== "6-K") return false;
  const primaryDocument = stringValue(row.primaryDocument)?.toLowerCase() ?? "";
  const reportDate = stringValue(row.reportDate);
  if (!reportDate) return false;
  if (symbol === "ASML") return primaryDocument.includes("quarterlyfilings");
  return /^tsm-\d{8}x6k\.htm$/i.test(primaryDocument) && Boolean(fiscalQuarterFromQuarterEnd(reportDate));
}

function fiscalQuarterFromQuarterEnd(value: string) {
  const date = parseIsoDate(value);
  if (!date) return null;
  const month = date.getUTCMonth() + 1;
  const quarterEndMonth = Math.ceil(month / 3) * 3;
  const quarterEndDay = new Date(Date.UTC(date.getUTCFullYear(), quarterEndMonth, 0)).getUTCDate();
  if (month !== quarterEndMonth || quarterEndDay - date.getUTCDate() > 7) return null;
  return { year: date.getUTCFullYear(), period: `Q${quarterEndMonth / 3}` };
}

function secFilingUrl(cik: string, accession?: string, primaryDocument?: string) {
  if (!accession || !primaryDocument) return undefined;
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${primaryDocument}`;
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
  if (value == null || value === "" || typeof value === "boolean") return undefined;
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

async function hydrateFullContent(value: unknown, baseUrl: string) {
  const record = asRecord(value);
  const url = stringValue(record?.full_content_file_url);
  if (!url) return value;
  try {
    const hydrated = await fetchTrustedContent(publicQVerisResultUrl(new URL(url), baseUrl));
    return hydrated ?? value;
  } catch {
    return value;
  }
}

function publicQVerisResultUrl(url: URL, baseUrl: string) {
  const token = url.pathname.match(/\/tool-results\/([A-Za-z0-9._~-]+)$/)?.[1];
  const privateHost = /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  return url.protocol === "http:" && privateHost && token
    ? new URL(`${baseUrl.replace(/\/+$/, "")}/tool-results/${token}`)
    : url;
}

async function fetchTrustedContent(url: URL, redirects = 0): Promise<unknown | null> {
  if (!isTrustedFullContentUrl(url) || redirects > 3) return null;
  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    return location ? fetchTrustedContent(new URL(location, url), redirects + 1) : null;
  }
  if (!res.ok || isOversize(res.headers.get("content-length"))) return null;
  const text = await readLimitedText(res);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

function closestReportDate(fiscalPeriod: string | undefined, rows: Record<string, unknown>[]) {
  const fiscal = fiscalPeriod ? parseIsoDate(fiscalPeriod) : null;
  if (!fiscal) return undefined;
  return rows
    .flatMap((row) => {
      const value = stringValue(row.date);
      const date = value ? parseIsoDate(value) : null;
      if (!value || !date) return [];
      const distance = Math.abs(date.getTime() - fiscal.getTime());
      return distance <= 75 * 86_400_000 ? [{ value, distance }] : [];
    })
    .sort((a, b) => a.distance - b.distance)[0]?.value;
}

function fiscalQuarter(value?: string) {
  return value?.match(/Q([1-4])/i)?.[1];
}

export function extractGuidanceText(entries: Record<string, unknown>[]) {
  const guidance: Array<{ sentence: string; score: number; order: number }> = [];
  let order = 0;
  for (const entry of entries) {
    const content = stringValue(entry.content);
    if (!content || transcriptRole(entry) === "analyst") continue;
    for (const sentence of content.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)) {
      if (!isGuidanceSentence(sentence)) continue;
      guidance.push({ sentence, score: guidanceSentenceScore(sentence), order: order++ });
    }
  }
  if (!guidance.length) return undefined;
  return guidance
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 2)
    .sort((a, b) => a.order - b.order)
    .map((item) => item.sentence)
    .join(" ")
    .slice(0, 1200);
}

function guidanceSentenceScore(value: string) {
  let score = 0;
  if (/\b(?:fiscal\s+)?Q[1-4]\b|\bnext quarter\b/i.test(value)) score += 80;
  if (/\bturning to (?:our )?guidance\b/i.test(value)) score += 60;
  if (/[$€£]\s*[\d,.]+|\d+(?:\.\d+)?%/i.test(value)) score += 40;
  if (/\b(?:EPS|earnings per share|gross margin|operating margin)\b/i.test(value)) score += 30;
  if (/\b(?:plus or minus|between|range of)\b/i.test(value)) score += 25;
  if (/\b(?:SCA|strategic customer agreement|RPO|remaining performance obligation|when (?:all )?(?:planned|completed)|over the term)\b/i.test(value)) score -= 120;
  return score;
}

function isGuidanceSentence(value: string) {
  return !value.includes("?")
    && !/\bbefore\s+turning\s+to\s+(?:the\s+)?outlook\b/i.test(value)
    && hasFutureAnchor(value)
    && /\b(guidance|outlook|forecast(?:ing)?|project(?:ion)?|expect(?:ed|s|ing)?|guiding|range)\b/i.test(value)
    && /\b(revenue|sales|EPS|earnings per share|NII|net interest income|expense(?:s)?|margin)\b/i.test(value);
}

function hasFutureAnchor(value: string) {
  return /\b(?:we\s+(?:now\s+)?(?:expect|forecast|project)|we\s+are\s+guiding|we\s+will|(?:is|are)\s+(?:expected|projected|forecast)|(?:guidance|outlook|forecast)\s+(?:calls\s+for|assumes|is)|we\s+(?:revised|raised|lowered)\b[^.!?]{0,80}\b(?:guidance|outlook))\b/i.test(value);
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
  return [...new Set(entries
    .filter((entry) => transcriptRole(entry) === "analyst")
    .map((entry) => questionExcerpt(stringValue(entry.content) ?? ""))
    .filter((question): question is string => Boolean(question)))]
    .slice(0, 5);
}

function extractManagementAnswers(entries: Record<string, unknown>[], sourceIds: string[]) {
  return entries.flatMap((entry, index) => {
    if (transcriptRole(entry) !== "analyst") return [];
    const question = stringValue(entry.content) ?? "";
    const topic = questionExcerpt(question);
    if (!topic) return [];
    const answerEntry = entries.slice(index + 1).find((item) => {
      const role = transcriptRole(item);
      return role === "management" || role === "analyst";
    });
    if (!answerEntry || transcriptRole(answerEntry) !== "management") return [];
    const answer = answerExcerpt(stringValue(answerEntry.content) ?? "");
    return answer ? [{ topic, answer, sourceIds }] : [];
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

function questionExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const questions = normalized.match(/[^?]+\?/g);
  const excerpt = questions?.slice(-2).join(" ").trim() ?? "";
  if (!excerpt) return undefined;
  return excerpt.length > 280 ? `...${excerpt.slice(-277).trim()}` : excerpt;
}

function answerExcerpt(text: string) {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const excerpt = sentences.slice(0, sentences[0]?.length < 30 ? 3 : 2).join(" ");
  if (!excerpt) return undefined;
  return excerpt.length > 420 ? `${excerpt.slice(0, 417).trim()}...` : excerpt;
}
