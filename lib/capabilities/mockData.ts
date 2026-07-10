import type {
  AnalystRevision,
  CompanyProfile,
  EarningsEstimates,
  EarningsEvent,
  EarningsResults,
  FilingItem,
  HistoricalEarnings,
  NewsItem,
  SourceRef,
  StockQuote,
  TranscriptInsight,
} from "@/lib/earnings/types";

const retrievedAt = "2026-07-08T00:00:00.000Z";

const COMPANY: Record<string, Omit<CompanyProfile, "sourceIds">> = {
  NVDA: { ticker: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCap: 4200000000000, currency: "USD" },
  TSLA: { ticker: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical", industry: "Automotive", marketCap: 1100000000000, currency: "USD" },
  MSFT: { ticker: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", sector: "Technology", industry: "Software", marketCap: 3900000000000, currency: "USD" },
  AAPL: { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Consumer Electronics", marketCap: 3600000000000, currency: "USD" },
  META: { ticker: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", sector: "Communication Services", industry: "Internet", marketCap: 1900000000000, currency: "USD" },
  AMD: { ticker: "AMD", name: "Advanced Micro Devices, Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Semiconductors", marketCap: 290000000000, currency: "USD" },
  PLTR: { ticker: "PLTR", name: "Palantir Technologies Inc.", exchange: "NASDAQ", sector: "Technology", industry: "Software", marketCap: 330000000000, currency: "USD" },
  AMZN: { ticker: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", sector: "Consumer Cyclical", industry: "Internet Retail", marketCap: 2500000000000, currency: "USD" },
};

export const MOCK_TICKERS = Object.keys(COMPANY);

export function mockSources(ticker: string): SourceRef[] {
  return [
    { id: `${ticker}-demo-calendar`, title: `${ticker} Demo source: earnings calendar`, provider: "QVeris Demo", retrievedAt, capability: "get_earnings_calendar" },
    { id: `${ticker}-demo-estimates`, title: `${ticker} Demo source: consensus estimates`, provider: "QVeris Demo", retrievedAt, capability: "get_earnings_estimates" },
    { id: `${ticker}-demo-results`, title: `${ticker} Demo source: earnings results`, provider: "QVeris Demo", retrievedAt, capability: "get_earnings_results" },
    { id: `${ticker}-demo-quote`, title: `${ticker} Demo source: stock quote`, provider: "QVeris Demo", retrievedAt, capability: "get_stock_quote" },
    { id: `${ticker}-demo-news`, title: `${ticker} Demo source: financial news`, provider: "QVeris Demo", retrievedAt, capability: "get_financial_news" },
    { id: `${ticker}-demo-filings`, title: `${ticker} Demo source: SEC filings`, provider: "QVeris Demo", retrievedAt, capability: "get_sec_filings" },
    { id: `${ticker}-demo-transcript`, title: `${ticker} Demo source: earnings transcript`, provider: "QVeris Demo", retrievedAt, capability: "get_earnings_transcript" },
  ];
}

export function mockCompany(ticker: string): CompanyProfile | null {
  const company = COMPANY[ticker.toUpperCase()];
  return company ? { ...company, sourceIds: [`${company.ticker}-demo-calendar`] } : null;
}

export function mockEvents(ticker?: string): EarningsEvent[] {
  const selected = ticker ? [ticker.toUpperCase()] : MOCK_TICKERS;
  return selected.flatMap((symbol, index) => {
    if (!COMPANY[symbol]) return [];
    return [
      {
        id: `${symbol}-2026-q2`,
        ticker: symbol,
        fiscalPeriod: "Q2",
        fiscalYear: 2026,
        reportDate: `2026-07-${String(21 + (index % 7)).padStart(2, "0")}`,
        timing: index % 2 === 0 ? "after_close" : "before_open",
        status: "upcoming",
        sourceIds: [`${symbol}-demo-calendar`],
      },
      {
        id: `${symbol}-2026-q1`,
        ticker: symbol,
        fiscalPeriod: "Q1",
        fiscalYear: 2026,
        reportDate: `2026-07-${String(1 + (index % 6)).padStart(2, "0")}`,
        timing: index % 2 === 0 ? "after_close" : "before_open",
        status: "reported",
        sourceIds: [`${symbol}-demo-calendar`],
      },
    ];
  });
}

export function mockEstimates(ticker: string, eventId?: string): EarningsEstimates | null {
  const symbol = ticker.toUpperCase();
  if (!COMPANY[symbol]) return null;
  const seed = MOCK_TICKERS.indexOf(symbol) + 1;
  return {
    ticker: symbol,
    eventId,
    revenueEstimate: (20 + seed * 9.5) * 1_000_000_000,
    epsEstimate: Number((0.65 + seed * 0.21).toFixed(2)),
    revenueGrowthEstimateYoY: Number((8 + seed * 1.8).toFixed(1)),
    epsGrowthEstimateYoY: Number((6 + seed * 2.1).toFixed(1)),
    estimateCount: 24 + seed,
    sourceIds: [`${symbol}-demo-estimates`],
  };
}

export function mockResults(ticker: string, eventId?: string): EarningsResults | null {
  const symbol = ticker.toUpperCase();
  const estimate = mockEstimates(symbol, eventId);
  if (!estimate) return null;
  const seed = MOCK_TICKERS.indexOf(symbol) + 1;
  const direction = seed % 3 === 0 ? 0.985 : seed % 2 === 0 ? 1.003 : 1.028;
  return {
    ticker: symbol,
    eventId,
    revenueActual: Math.round((estimate.revenueEstimate ?? 0) * direction),
    epsActual: Number(((estimate.epsEstimate ?? 0) + (seed % 3 === 0 ? -0.04 : 0.06)).toFixed(2)),
    grossMargin: Number(((48 + seed * 1.7) / 100).toFixed(3)),
    operatingMargin: Number(((24 + seed * 1.2) / 100).toFixed(3)),
    netIncome: (5 + seed * 2.2) * 1_000_000_000,
    guidanceText: seed % 3 === 0 ? "Management lowered selected guidance ranges due to demand uncertainty." : "Management raised selected guidance ranges on stronger demand and operating leverage.",
    segmentHighlights: [
      "Demo segment highlight: core business remained the primary revenue driver.",
      "Demo segment highlight: margin commentary was more important than headline EPS.",
    ],
    sourceIds: [`${symbol}-demo-results`],
  };
}

export function mockHistory(ticker: string, limit = 8): HistoricalEarnings[] {
  const symbol = ticker.toUpperCase();
  if (!COMPANY[symbol]) return [];
  const seed = MOCK_TICKERS.indexOf(symbol) + 1;
  return Array.from({ length: limit }, (_, index) => {
    const estimate = (18 + seed * 4 + index * 1.2) * 1_000_000_000;
    const actual = estimate * (index % 3 === 0 ? 0.992 : 1.018);
    return {
      eventId: `${symbol}-hist-${index}`,
      fiscalPeriod: `Q${((index + 1) % 4) + 1}`,
      reportDate: `202${5 - Math.floor(index / 4)}-${String(10 - (index % 4) * 3).padStart(2, "0")}-25`,
      revenueEstimate: Math.round(estimate),
      revenueActual: Math.round(actual),
      epsEstimate: Number((0.6 + seed * 0.11 + index * 0.03).toFixed(2)),
      epsActual: Number((0.64 + seed * 0.11 + index * 0.02).toFixed(2)),
      oneDayMovePct: Number(((index % 2 === 0 ? 1 : -1) * (2.1 + seed * 0.3 + index * 0.2)).toFixed(1)),
      fiveDayMovePct: Number(((index % 2 === 0 ? 1 : -1) * (3.0 + seed * 0.35 + index * 0.25)).toFixed(1)),
      sourceIds: [`${symbol}-demo-results`, `${symbol}-demo-quote`],
    };
  });
}

export function mockQuote(ticker: string): StockQuote | null {
  const symbol = ticker.toUpperCase();
  if (!COMPANY[symbol]) return null;
  const seed = MOCK_TICKERS.indexOf(symbol) + 1;
  return {
    ticker: symbol,
    price: Number((140 + seed * 18.7).toFixed(2)),
    changePct: Number(((seed % 2 === 0 ? -1 : 1) * (0.8 + seed * 0.4)).toFixed(2)),
    afterHoursChangePct: Number(((seed % 3 === 0 ? -1 : 1) * (1.2 + seed * 0.3)).toFixed(2)),
    preMarketChangePct: Number(((seed % 4 === 0 ? -1 : 1) * (0.5 + seed * 0.2)).toFixed(2)),
    volume: (20 + seed * 5) * 1_000_000,
    avgVolume30d: (18 + seed * 4) * 1_000_000,
    timestamp: retrievedAt,
    sourceIds: [`${symbol}-demo-quote`],
  };
}

export function mockNews(ticker: string, limit = 5): NewsItem[] {
  const symbol = ticker.toUpperCase();
  if (!COMPANY[symbol]) return [];
  return Array.from({ length: limit }, (_, index) => ({
    id: `${symbol}-news-${index}`,
    title: `${symbol} demo earnings context item ${index + 1}`,
    summary: "Demo news summary for product development; replace with QVeris financial news capability in production.",
    publishedAt: `2026-07-${String(7 - index).padStart(2, "0")}T12:00:00.000Z`,
    provider: "QVeris Demo",
    sourceIds: [`${symbol}-demo-news`],
  }));
}

export function mockFilings(ticker: string): FilingItem[] {
  const symbol = ticker.toUpperCase();
  if (!COMPANY[symbol]) return [];
  return [
    {
      id: `${symbol}-8k-demo`,
      formType: "8-K",
      filedAt: "2026-07-02T20:30:00.000Z",
      title: `${symbol} demo Form 8-K earnings release`,
      summary: "Demo filing summary for product development.",
      sourceIds: [`${symbol}-demo-filings`],
    },
    {
      id: `${symbol}-10q-demo`,
      formType: "10-Q",
      filedAt: "2026-05-01T20:30:00.000Z",
      title: `${symbol} demo Form 10-Q`,
      summary: "Demo quarterly filing summary for risk and segment context.",
      sourceIds: [`${symbol}-demo-filings`],
    },
  ];
}

export function mockTranscript(ticker: string): TranscriptInsight | null {
  const symbol = ticker.toUpperCase();
  if (!COMPANY[symbol]) return null;
  const available = !["TSLA", "PLTR", "AMZN"].includes(symbol);
  return {
    available,
    managementTone: available ? "more_positive" : "unavailable",
    guidanceTone: available ? "neutral" : "unavailable",
    riskLanguage: available ? "unchanged" : "unavailable",
    repeatedQuestions: available ? ["AI capex durability", "Margin trajectory", "Demand visibility"] : [],
    managementAnswers: available ? [
      { topic: "AI capex durability", answer: "Management framed AI capex as tied to customer demand visibility and supply availability.", sourceIds: [`${symbol}-demo-transcript`] },
      { topic: "Margin trajectory", answer: "Management said mix and operating discipline remain the main drivers of margin trajectory.", sourceIds: [`${symbol}-demo-transcript`] },
    ] : [],
    keyQuotes: available ? [{ text: "Demo short quote only.", speaker: "Management", sourceIds: [`${symbol}-demo-transcript`] }] : [],
    sourceIds: available ? [`${symbol}-demo-transcript`] : [],
  };
}

export function mockAnalystRevisions(ticker: string): AnalystRevision[] {
  const symbol = ticker.toUpperCase();
  if (!COMPANY[symbol]) return [];
  return [
    {
      id: `${symbol}-rev-1`,
      ticker: symbol,
      metric: "eps",
      direction: "up",
      summary: "Demo analyst revision: EPS estimates moved higher into the event.",
      publishedAt: "2026-07-06T13:00:00.000Z",
      sourceIds: [`${symbol}-demo-estimates`],
    },
  ];
}
