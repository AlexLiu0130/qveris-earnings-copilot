import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";
import { getEarningsProvider } from "@/lib/capabilities/provider";
import { computeBeatMiss } from "@/lib/earnings/computeBeatMiss";
import { computeHistoricalPattern } from "@/lib/earnings/computeHistoricalPattern";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import { detectEarningsMode } from "@/lib/earnings/detectEarningsMode";
import { generateKeyQuestions } from "@/lib/earnings/generateKeyQuestions";
import { generateResearchSummary } from "@/lib/earnings/generateResearchSummary";
import { generateAiSummary } from "@/lib/earnings/aiSummary";
import { scoreConfidence } from "@/lib/earnings/confidenceScoring";
import { buildAnalysisId } from "@/lib/earnings/analysisId";
import { buildSourceRefs } from "@/lib/earnings/buildSourceRefs";
import { missingFromStatus, stateFor } from "@/lib/earnings/capabilityStatus";
import { sourceIdsFrom, uniqueSources } from "@/lib/earnings/sourceRefs";
import { buildEventStatus, buildWhatChanged, oneLineVerdict } from "@/lib/earnings/eventWorkspace";
import { detectDataConflicts, resolveEventEstimates, selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import { buildMarketReaction } from "@/lib/earnings/marketReaction";
import { localizeGuidanceText, localizeSources, localizeTranscript } from "@/lib/earnings/localize";
import type { AnalyzeEarningsRequest, AnalyzeEarningsResponse, EarningsAnalysis, FilingParams, ResolvedAnalysisMode } from "@/lib/earnings/types";

export async function analyzeEarnings(
  request: AnalyzeEarningsRequest,
  provider: EarningsCapabilityProvider = getEarningsProvider(),
): Promise<EarningsAnalysis> {
  const ticker = normalizeTicker(request.ticker);
  if (!ticker) throw new Error("INVALID_TICKER");
  const language = request.language ?? "en";

  const today = todayIso();
  const calendar = await provider.getEarningsCalendar({ from: addDaysIso(today, -30), to: addDaysIso(today, 45), universe: ticker });
  const detected = detectEarningsMode(calendar.filter((event) => event.ticker === ticker), today);
  const mode = resolveRequestedMode(request.mode ?? "auto", detected.mode);
  const event = detected.event;
  const filingParams: FilingParams = event?.status === "reported"
    ? {
        from: addDaysIso(event.reportDate, -2),
        to: addDaysIso(event.reportDate, 7),
        limit: 10,
        formTypes: ["8-K", "10-Q"],
      }
    : { limit: 5 };

  const [
    company,
    providerEstimates,
    providerResults,
    historicalPattern,
    quote,
    priceBars,
    financials,
    segmentRevenue,
    news,
    filings,
    providerTranscript,
    analystRevisions,
  ] = await Promise.all([
    provider.getCompanyProfile(ticker),
    event ? provider.getEarningsEstimates(ticker, event.id) : provider.getEarningsEstimates(ticker),
    event && (mode === "flash" || mode === "combined" || mode === "call_intelligence")
      ? provider.getEarningsResults(ticker, event)
      : Promise.resolve(null),
    request.includeHistoricalPattern === false ? Promise.resolve([]) : provider.getHistoricalEarnings(ticker, 8),
    provider.getStockQuote(ticker),
    event?.status === "reported"
      ? provider.getHistoricalPrices(ticker, { from: addDaysIso(event.reportDate, -7), to: addDaysIso(event.reportDate, 10) })
      : Promise.resolve([]),
    provider.getFinancialStatements?.(ticker, 4) ?? Promise.resolve([]),
    provider.getRevenueSegments?.(ticker, 4) ?? Promise.resolve([]),
    request.includeNews === false ? Promise.resolve([]) : provider.getFinancialNews(ticker, { limit: request.maxNewsItems ?? 5 }),
    request.includeFilings === false ? Promise.resolve([]) : provider.getSecFilings(ticker, filingParams),
    request.includeTranscript === false || !event || mode === "preview" || mode === "no_event"
      ? Promise.resolve(null)
      : provider.getEarningsTranscript?.(ticker, event) ?? Promise.resolve(null),
    provider.getAnalystRevisions?.(ticker, { limit: 5 }) ?? Promise.resolve([]),
  ]);

  if (!company && calendar.length === 0 && !quote) throw new Error("TICKER_NOT_FOUND");

  const estimates = resolveEventEstimates(event, providerEstimates);
  const results = providerResults ? {
    ...providerResults,
    guidanceText: localizeGuidanceText(providerResults.guidanceText, language, event?.fiscalYear),
  } : providerResults;
  const transcript = localizeTranscript(providerTranscript, language);
  const marketReaction = buildMarketReaction(event, priceBars);
  const eventFinancials = selectFiscalPeriod(financials, event);
  const eventSegments = selectFiscalPeriod(segmentRevenue, event);
  const beatMiss = computeBeatMiss(providerResults, estimates);
  const historicalSummary = computeHistoricalPattern(historicalPattern);
  const keyQuestions = generateKeyQuestions({ company, news, filings, historical: historicalPattern }, language);
  const capabilityStatus = {
    companyProfile: stateFor(company, { demo: hasDemoSource(company) }),
    earningsCalendar: stateFor(calendar, { demo: hasDemoSource(calendar) }),
    estimates: stateFor(estimates, { demo: hasDemoSource(estimates) }),
    results: stateFor(results, { demo: hasDemoSource(results) }),
    historicalEarnings: stateFor(historicalPattern, { demo: hasDemoSource(historicalPattern) }),
    quote: stateFor(quote, { demo: hasDemoSource(quote) }),
    financials: stateFor(financials, {
      demo: hasDemoSource(financials),
      partial: Boolean(event?.status === "reported" && financials.length && !eventFinancials),
    }),
    segmentRevenue: stateFor(segmentRevenue, {
      demo: hasDemoSource(segmentRevenue),
      partial: Boolean(event?.status === "reported" && segmentRevenue.length && !eventSegments),
    }),
    news: stateFor(news, { demo: hasDemoSource(news) }),
    filings: stateFor(filings, { demo: hasDemoSource(filings) }),
    transcript: stateFor(transcript, { demo: hasDemoSource(transcript) }),
    analystRevisions: stateFor(analystRevisions, { demo: hasDemoSource(analystRevisions) }),
  };

  const sourceIds = sourceIdsFrom(
    company,
    event,
    detected.upcomingEvent,
    detected.recentEvent,
    estimates,
    results,
    quote,
    ...priceBars,
    ...financials,
    ...segmentRevenue,
    transcript,
    ...historicalPattern,
    ...news,
    ...filings,
    ...analystRevisions,
  );
  const sources = localizeSources(uniqueSources([...(provider.getSourceRefs?.() ?? []), ...buildSourceRefs(ticker, sourceIds)]), language);
  const conflicts = detectDataConflicts({ event, estimates, results, financials }, language);
  if (conflicts.length) capabilityStatus.financials = "conflict";
  const deterministic = generateResearchSummary({
    mode,
    event,
    company,
    estimates,
    results,
    beatMiss,
    historicalSummary,
    financials,
    segmentRevenue,
    transcript,
    news,
    filings,
  }, language);
  const confidence = scoreConfidence({ mode, estimates, results, sources, capabilityStatus, conflicts }, language);
  const generatedAt = new Date().toISOString();
  const analysisId = buildAnalysisId({ ticker, mode, generatedAt });
  const missing = missingFromStatus(capabilityStatus);
  const ai = request.includeAiSummary === false ? null : await generateAiSummary({
    ticker,
    language,
    mode,
    company,
    event,
    estimates,
    results,
    quote,
    marketReaction,
    financials,
    segmentRevenue,
    historicalSummary,
    news,
    filings,
    transcript,
    beatMiss,
    missing,
    confidence,
  });
  const generated = mergeGenerated(deterministic, ai);
  const workspaceInput = {
    event,
    upcomingEvent: detected.upcomingEvent,
    recentEvent: detected.recentEvent,
    estimates,
    results,
    quote,
    financials,
    segmentRevenue,
    news,
    filings,
    transcript,
    summaryBullets: generated.summaryBullets,
    historicalPattern,
    keyDrivers: generated.keyDrivers,
    riskSignals: generated.riskSignals,
    qualityOfEarnings: generated.qualityOfEarnings,
    sources,
    conflicts,
  };

  return {
    analysisId,
    ticker,
    language,
    mode,
    company,
    event,
    upcomingEvent: detected.upcomingEvent,
    recentEvent: detected.recentEvent,
    estimates,
    results,
    quote,
    marketReaction,
    financials,
    segmentRevenue,
    historicalPattern,
    historicalSummary,
    news,
    filings,
    transcript,
    analystRevisions,
    beatMiss,
    oneLineVerdict: oneLineVerdict(generated.summaryBullets, event, language),
    eventStatus: buildEventStatus(workspaceInput, language),
    whatChanged: buildWhatChanged(workspaceInput, language),
    keyQuestions,
    keyDrivers: generated.keyDrivers,
    riskSignals: generated.riskSignals,
    qualityOfEarnings: generated.qualityOfEarnings,
    summaryBullets: generated.summaryBullets,
    watchNext: generated.watchNext,
    confidence,
    caveats: language === "zh"
      ? ["本页面仅供研究参考，不构成投资建议。", "财务数据和一致预期可能在发布后继续更新。", "市场反应还可能受到业绩指引、预期、持仓和管理层表述影响。"]
      : ["This is research information, not investment advice.", "Financial data and estimates may update after publication.", "Market reaction may depend on guidance, expectations, positioning, and management commentary."],
    capabilityStatus,
    missing,
    conflicts,
    sources,
    generatedAt,
    demo: sources.some((source) => source.provider === "QVeris Demo"),
  };
}

export function toAnalyzeResponse(analysis: EarningsAnalysis): AnalyzeEarningsResponse {
  return {
    analysisId: analysis.analysisId,
    ticker: analysis.ticker,
    language: analysis.language,
    mode: analysis.mode,
    generatedAt: analysis.generatedAt,
    analysis: {
      summaryBullets: analysis.summaryBullets,
      oneLineVerdict: analysis.oneLineVerdict,
      eventStatus: analysis.eventStatus,
      whatChanged: analysis.whatChanged,
      keyQuestions: analysis.keyQuestions,
      keyDrivers: analysis.keyDrivers,
      riskSignals: analysis.riskSignals,
      qualityOfEarnings: analysis.qualityOfEarnings,
      watchNext: analysis.watchNext,
      confidence: analysis.confidence,
      caveats: analysis.caveats,
    },
    data: {
      ticker: analysis.ticker,
      language: analysis.language,
      company: analysis.company,
      event: analysis.event,
      upcomingEvent: analysis.upcomingEvent,
      recentEvent: analysis.recentEvent,
      estimates: analysis.estimates,
      results: analysis.results,
      quote: analysis.quote,
      marketReaction: analysis.marketReaction,
      financials: analysis.financials,
      segmentRevenue: analysis.segmentRevenue,
      historicalPattern: analysis.historicalPattern,
      historicalSummary: analysis.historicalSummary,
      news: analysis.news,
      filings: analysis.filings,
      transcript: analysis.transcript,
      analystRevisions: analysis.analystRevisions,
      beatMiss: analysis.beatMiss,
      demo: analysis.demo,
    },
    capabilityStatus: analysis.capabilityStatus,
    missing: analysis.missing,
    conflicts: analysis.conflicts,
    sources: analysis.sources,
  };
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/^\$/, "");
}

function hasDemoSource(value: unknown): boolean {
  if (!value) return false;
  if (Array.isArray(value)) return value.some(hasDemoSource);
  if (typeof value !== "object") return false;
  const sourceIds = (value as { sourceIds?: string[] }).sourceIds ?? [];
  return sourceIds.some((sourceId) => sourceId.includes("-demo-"));
}

function resolveRequestedMode(requested: string, detected: ResolvedAnalysisMode): ResolvedAnalysisMode {
  if (requested === "auto") return detected;
  if (["preview", "flash", "call_intelligence", "combined", "no_event"].includes(requested)) {
    return requested as ResolvedAnalysisMode;
  }
  return detected;
}

function mergeGenerated<T extends {
  summaryBullets: string[];
  keyDrivers: string[];
  riskSignals: string[];
  qualityOfEarnings: string[];
  watchNext: string[];
}>(deterministic: T, ai: Partial<T> | null): T {
  if (!ai) return deterministic;
  return {
    summaryBullets: ai.summaryBullets?.length ? ai.summaryBullets : deterministic.summaryBullets,
    keyDrivers: ai.keyDrivers?.length ? ai.keyDrivers : deterministic.keyDrivers,
    riskSignals: ai.riskSignals?.length ? ai.riskSignals : deterministic.riskSignals,
    qualityOfEarnings: ai.qualityOfEarnings?.length ? ai.qualityOfEarnings : deterministic.qualityOfEarnings,
    watchNext: ai.watchNext?.length ? ai.watchNext : deterministic.watchNext,
  } as T;
}
