import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";
import type { AnalystParams, EarningsCalendarParams, EarningsEvent, FilingParams, HistoricalPriceParams, NewsParams } from "@/lib/earnings/types";

export class HybridEarningsCapabilityProvider implements EarningsCapabilityProvider {
  constructor(private readonly options: {
    primary: EarningsCapabilityProvider;
    fallback: EarningsCapabilityProvider;
    allowDemoFallback: boolean;
  }) {}

  getSourceRefs() {
    return [
      ...(this.options.primary.getSourceRefs?.() ?? []),
      ...(this.options.allowDemoFallback ? (this.options.fallback.getSourceRefs?.() ?? []) : []),
    ];
  }

  async getCompanyProfile(ticker: string) {
    return (await this.options.primary.getCompanyProfile(ticker)) ?? this.fallbackNullable((p) => p.getCompanyProfile(ticker));
  }

  async getEarningsCalendar(params: EarningsCalendarParams) {
    const data = await this.options.primary.getEarningsCalendar(params);
    return data.length ? data : this.fallbackArray((p) => p.getEarningsCalendar(params));
  }

  async getEarningsEstimates(ticker: string, event?: EarningsEvent | null) {
    return (await this.options.primary.getEarningsEstimates(ticker, event)) ?? this.fallbackNullable((p) => p.getEarningsEstimates(ticker, event));
  }

  async getEarningsResults(ticker: string, event?: EarningsEvent | null) {
    return (await this.options.primary.getEarningsResults(ticker, event)) ?? this.fallbackNullable((p) => p.getEarningsResults(ticker, event));
  }

  async getHistoricalEarnings(ticker: string, limit?: number) {
    const data = await this.options.primary.getHistoricalEarnings(ticker, limit);
    return data.length ? data : this.fallbackArray((p) => p.getHistoricalEarnings(ticker, limit));
  }

  async getStockQuote(ticker: string) {
    return (await this.options.primary.getStockQuote(ticker)) ?? this.fallbackNullable((p) => p.getStockQuote(ticker));
  }

  async getHistoricalPrices(ticker: string, params: HistoricalPriceParams) {
    const data = await this.options.primary.getHistoricalPrices(ticker, params);
    return data.length ? data : this.fallbackArray((p) => p.getHistoricalPrices(ticker, params));
  }

  async getFinancialStatements(ticker: string, limit?: number) {
    const data = await this.options.primary.getFinancialStatements?.(ticker, limit) ?? [];
    return data.length ? data : this.fallbackArray((p) => p.getFinancialStatements?.(ticker, limit) ?? []);
  }

  async getRevenueSegments(ticker: string, limit?: number) {
    const data = await this.options.primary.getRevenueSegments?.(ticker, limit) ?? [];
    return data.length ? data : this.fallbackArray((p) => p.getRevenueSegments?.(ticker, limit) ?? []);
  }

  async getFinancialNews(ticker: string, params: NewsParams) {
    const data = await this.options.primary.getFinancialNews(ticker, params);
    return data.length ? data : this.fallbackArray((p) => p.getFinancialNews(ticker, params));
  }

  async getSecFilings(ticker: string, params: FilingParams) {
    const data = await this.options.primary.getSecFilings(ticker, params);
    return data.length ? data : this.fallbackArray((p) => p.getSecFilings(ticker, params));
  }

  async getEarningsTranscript(ticker: string, event?: EarningsEvent | null) {
    return (await this.options.primary.getEarningsTranscript?.(ticker, event)) ?? this.fallbackNullable((p) => p.getEarningsTranscript?.(ticker, event) ?? null);
  }

  async getAnalystRevisions(ticker: string, params: AnalystParams = {}) {
    const data = await this.options.primary.getAnalystRevisions?.(ticker, params);
    return data?.length ? data : this.fallbackArray((p) => p.getAnalystRevisions?.(ticker, params) ?? []);
  }

  private async fallbackNullable<T>(fn: (provider: EarningsCapabilityProvider) => Promise<T | null> | T | null): Promise<T | null> {
    if (!this.options.allowDemoFallback) return null;
    return fn(this.options.fallback);
  }

  private async fallbackArray<T>(fn: (provider: EarningsCapabilityProvider) => Promise<T[]> | T[]): Promise<T[]> {
    if (!this.options.allowDemoFallback) return [];
    return fn(this.options.fallback);
  }
}
