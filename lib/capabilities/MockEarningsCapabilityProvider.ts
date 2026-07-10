import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import type { EarningsCalendarParams, HistoricalPriceParams, NewsParams } from "@/lib/earnings/types";
import {
  mockAnalystRevisions,
  mockCompany,
  mockEstimates,
  mockEvents,
  mockFilings,
  mockHistory,
  mockNews,
  mockQuote,
  mockResults,
  mockTranscript,
} from "@/lib/capabilities/mockData";

export class MockEarningsCapabilityProvider implements EarningsCapabilityProvider {
  async getCompanyProfile(ticker: string) {
    return mockCompany(ticker);
  }

  async getEarningsCalendar(params: EarningsCalendarParams) {
    return mockEvents()
      .filter((event) => matchesUniverse(event.ticker, params.universe))
      .filter((event) => matchesProfileFilters(event.ticker, params))
      .filter((event) => event.reportDate >= params.from && event.reportDate <= params.to)
      .filter((event) => !params.status || event.status === params.status)
      .filter((event) => !params.timing || event.timing === params.timing);
  }

  async getEarningsEstimates(ticker: string, eventId?: string) {
    return mockEstimates(ticker, eventId);
  }

  async getEarningsResults(ticker: string, event?: import("@/lib/earnings/types").EarningsEvent | null) {
    return mockResults(ticker, event?.id);
  }

  async getHistoricalEarnings(ticker: string, limit = 8) {
    return mockHistory(ticker, limit);
  }

  async getStockQuote(ticker: string) {
    return mockQuote(ticker);
  }

  async getHistoricalPrices(ticker: string, params: HistoricalPriceParams) {
    const quote = mockQuote(ticker);
    if (!quote?.price) return [];
    const days = Math.max(1, Math.min(30, Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86_400_000)));
    return Array.from({ length: days }, (_, index) => ({
      date: addDaysIso(params.from || todayIso(), index),
      open: Number((quote.price! * (1 - index * 0.0025)).toFixed(2)),
      close: Number((quote.price! * (1 - index * 0.002)).toFixed(2)),
      volume: quote.volume,
      sourceIds: quote.sourceIds,
    }));
  }

  async getFinancialNews(ticker: string, params: NewsParams = {}) {
    return mockNews(ticker, params.limit ?? 5);
  }

  async getSecFilings(ticker: string) {
    return mockFilings(ticker);
  }

  async getEarningsTranscript(ticker: string) {
    return mockTranscript(ticker);
  }

  async getAnalystRevisions(ticker: string) {
    return mockAnalystRevisions(ticker);
  }
}

function matchesUniverse(ticker: string, universe?: string) {
  if (!universe || ["popular", "core", "all"].includes(universe.toLowerCase())) return true;
  const symbols = new Set(universe.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean));
  return symbols.has(ticker.toUpperCase());
}

function matchesProfileFilters(ticker: string, params: EarningsCalendarParams) {
  const company = mockCompany(ticker);
  if (!company) return false;
  if (params.sector && !`${company.sector ?? ""} ${company.industry ?? ""}`.toLowerCase().includes(params.sector.toLowerCase())) {
    return false;
  }
  if (params.minMarketCap != null && (company.marketCap ?? 0) < params.minMarketCap) return false;
  return true;
}
