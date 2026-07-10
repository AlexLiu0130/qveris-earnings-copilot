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

export interface EarningsCapabilityProvider {
  getSourceRefs?(): SourceRef[];
  getCompanyProfile(ticker: string): Promise<CompanyProfile | null>;
  getEarningsCalendar(params: EarningsCalendarParams): Promise<EarningsEvent[]>;
  getEarningsEstimates(ticker: string, eventId?: string): Promise<EarningsEstimates | null>;
  getEarningsResults(ticker: string, event?: EarningsEvent | null): Promise<EarningsResults | null>;
  getHistoricalEarnings(ticker: string, limit?: number): Promise<HistoricalEarnings[]>;
  getStockQuote(ticker: string): Promise<StockQuote | null>;
  getHistoricalPrices(ticker: string, params: HistoricalPriceParams): Promise<PriceBar[]>;
  getFinancialStatements?(ticker: string, limit?: number): Promise<FinancialStatementPeriod[]>;
  getRevenueSegments?(ticker: string, limit?: number): Promise<SegmentRevenue[]>;
  getFinancialNews(ticker: string, params: NewsParams): Promise<NewsItem[]>;
  getSecFilings(ticker: string, params: FilingParams): Promise<FilingItem[]>;
  getEarningsTranscript?(ticker: string, event?: EarningsEvent | null): Promise<TranscriptInsight | null>;
  getAnalystRevisions?(ticker: string, params: AnalystParams): Promise<AnalystRevision[]>;
}
