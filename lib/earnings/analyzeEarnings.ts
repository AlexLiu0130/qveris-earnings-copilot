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
import { missingFromStatus, stateFor } from "@/lib/earnings/capabilityStatus";
import { sourceIdsFrom, uniqueSources } from "@/lib/earnings/sourceRefs";
import { buildEventStatus, buildWhatChanged, oneLineVerdict } from "@/lib/earnings/eventWorkspace";
import { detectDataConflicts, resolveEventEstimates, selectFiscalPeriod } from "@/lib/earnings/dataQuality";
import { buildMarketReaction } from "@/lib/earnings/marketReaction";
import { localizeGuidanceText, localizeSources, localizeTranscript } from "@/lib/earnings/localize";
import { dataIssue, isQVerisCapabilityError } from "@/lib/earnings/providerIssues";
import type { AnalyzeEarningsRequest, AnalyzeEarningsResponse, ClaimSourceIds, DataIssue, EarningsAnalysis, EarningsClaimSourceIds, FilingParams, ResolvedAnalysisMode } from "@/lib/earnings/types";

export async function analyzeEarnings(
  request: AnalyzeEarningsRequest,
  provider: EarningsCapabilityProvider = getEarningsProvider(),
): Promise<EarningsAnalysis> {
  const ticker = normalizeTicker(request.ticker);
  if (!ticker) throw new Error("INVALID_TICKER");
  const language = request.language ?? "en";
  const issues: DataIssue[] = [];
  const safe = <T>(capability: string, code: string, fn: () => Promise<T>, fallback: T) =>
    safeCapability(issues, capability, code, fn, fallback);

  const today = todayIso();
  const calendar = await safe(
    "earningsCalendar",
    "EARNINGS_CALENDAR_UNAVAILABLE",
    () => provider.getEarningsCalendar({ from: addDaysIso(today, -30), to: addDaysIso(today, 45), universe: ticker }),
    [],
  );
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
    safe("profile", "PROFILE_UNAVAILABLE", () => provider.getCompanyProfile(ticker), null),
    safe("estimates", "ESTIMATES_UNAVAILABLE", () => provider.getEarningsEstimates(ticker, event), null),
    event && (mode === "flash" || mode === "combined" || mode === "call_intelligence")
      ? safe("results", "RESULTS_UNAVAILABLE", () => provider.getEarningsResults(ticker, event), null)
      : Promise.resolve(null),
    request.includeHistoricalPattern === false ? Promise.resolve([]) : safe("history", "EARNINGS_HISTORY_UNAVAILABLE", () => provider.getHistoricalEarnings(ticker, 8), []),
    safe("quote", "QUOTE_UNAVAILABLE", () => provider.getStockQuote(ticker), null),
    event?.status === "reported"
      ? safe("prices", "HISTORICAL_PRICES_UNAVAILABLE", () => provider.getHistoricalPrices(ticker, { from: addDaysIso(event.reportDate, -7), to: addDaysIso(event.reportDate, 10) }), [])
      : Promise.resolve([]),
    safe("financials", "FINANCIALS_UNAVAILABLE", () => provider.getFinancialStatements?.(ticker, 8) ?? Promise.resolve([]), []),
    safe("segments", "SEGMENTS_UNAVAILABLE", () => provider.getRevenueSegments?.(ticker, 4) ?? Promise.resolve([]), []),
    request.includeNews === false ? Promise.resolve([]) : safe("news", "NEWS_UNAVAILABLE", () => provider.getFinancialNews(ticker, { limit: request.maxNewsItems ?? 5 }), []),
    request.includeFilings === false ? Promise.resolve([]) : safe("filings", "FILINGS_UNAVAILABLE", () => provider.getSecFilings(ticker, filingParams), []),
    request.includeTranscript === false || !event || mode === "preview" || mode === "no_event"
      ? Promise.resolve(null)
      : safe("transcript", "TRANSCRIPT_UNAVAILABLE", () => provider.getEarningsTranscript?.(ticker, event) ?? Promise.resolve(null), null),
    safe("analystRevisions", "ANALYST_REVISIONS_UNAVAILABLE", () => provider.getAnalystRevisions?.(ticker, { limit: 5 }) ?? Promise.resolve([]), []),
  ]);

  if (!company && calendar.length === 0 && !quote && issues.length === 0) throw new Error("TICKER_NOT_FOUND");

  const estimates = resolveEventEstimates(event, providerEstimates, historicalPattern);
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
    companyProfile: stateForIssue(issues, "profile", company, { demo: hasDemoSource(company) }),
    earningsCalendar: stateForIssue(issues, "earningsCalendar", calendar, { demo: hasDemoSource(calendar) }),
    estimates: stateForIssue(issues, "estimates", estimates, { demo: hasDemoSource(estimates) }),
    results: stateForIssue(issues, "results", results, { demo: hasDemoSource(results) }),
    historicalEarnings: stateForIssue(issues, "history", historicalPattern, { demo: hasDemoSource(historicalPattern) }),
    quote: stateForIssue(issues, "quote", quote, { demo: hasDemoSource(quote) }),
    prices: event?.status === "reported" ? stateForIssue(issues, "prices", priceBars, { demo: hasDemoSource(priceBars) }) : "available",
    financials: stateForIssue(issues, "financials", financials, {
      demo: hasDemoSource(financials),
      partial: Boolean(event?.status === "reported" && financials.length && !eventFinancials),
    }),
    segmentRevenue: stateForIssue(issues, "segments", segmentRevenue, {
      demo: hasDemoSource(segmentRevenue),
      partial: Boolean(event?.status === "reported" && segmentRevenue.length && !eventSegments),
    }),
    news: stateForIssue(issues, "news", news, { demo: hasDemoSource(news) }),
    filings: stateForIssue(issues, "filings", filings, { demo: hasDemoSource(filings) }),
    transcript: stateForIssue(issues, "transcript", transcript, { demo: hasDemoSource(transcript) }),
    analystRevisions: stateForIssue(issues, "analystRevisions", analystRevisions, { demo: hasDemoSource(analystRevisions) }),
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
  const sources = localizeSources(uniqueSources(provider.getSourceRefs?.() ?? []).filter((source) => sourceIds.includes(source.id)), language);
  if (issues.length > 0 && sources.length === 0 && !hasEvidence([
    company,
    calendar,
    estimates,
    results,
    quote,
    priceBars,
    financials,
    segmentRevenue,
    transcript?.available ? transcript : null,
    historicalPattern,
    news,
    filings,
    analystRevisions,
  ])) {
    throw new Error("EARNINGS_DATA_UNAVAILABLE");
  }
  const knownSourceIds = new Set(sources.map((source) => source.id));
  const missingSourceIds = sourceIds.filter((sourceId) => !knownSourceIds.has(sourceId));
  for (const id of missingSourceIds) issues.push(missingSourceIssue(id));
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
  const deterministicWithSources = {
    ...deterministic,
    claimSourceIds: buildDeterministicClaimSourceIds(deterministic, {
      company,
      event,
      detected,
      estimates,
      results,
      quote,
      marketReaction,
      financials,
      eventFinancials,
      eventSegments,
      transcript,
      historicalPattern,
      news,
      filings,
    }, knownSourceIds),
  };
  const confidence = lowerConfidenceForSourceAudit(
    scoreConfidence({ mode, estimates, results, sources, capabilityStatus, conflicts }, language),
    missingSourceIds,
    language,
  );
  const generatedAt = new Date().toISOString();
  const analysisId = buildAnalysisId({ ticker, mode, generatedAt });
  const missing = [...new Set([...missingFromStatus(capabilityStatus), ...missingSourceIds.map((id) => `source:${id}`)])];
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
    sources,
  });
  const generated = mergeGenerated(deterministicWithSources, ai, knownSourceIds);
  const verdict = oneLineVerdict(generated.summaryBullets, event, language);
  const claimSourceIds = {
    oneLineVerdict: oneLineSourceIds(verdict, generated, event, knownSourceIds),
    ...generated.claimSourceIds,
  };
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
    oneLineVerdict: verdict,
    eventStatus: buildEventStatus(workspaceInput, language),
    whatChanged: buildWhatChanged(workspaceInput, language),
    keyQuestions,
    keyDrivers: generated.keyDrivers,
    riskSignals: generated.riskSignals,
    qualityOfEarnings: generated.qualityOfEarnings,
    summaryBullets: generated.summaryBullets,
    watchNext: generated.watchNext,
    claimSourceIds,
    confidence,
    caveats: language === "zh"
      ? ["本页面仅供研究参考，不构成投资建议。", "财务数据和一致预期可能在发布后继续更新。", "市场反应还可能受到业绩指引、预期、持仓和管理层表述影响。"]
      : ["This is research information, not investment advice.", "Financial data and estimates may update after publication.", "Market reaction may depend on guidance, expectations, positioning, and management commentary."],
    capabilityStatus,
    missing,
    issues,
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
      claimSourceIds: analysis.claimSourceIds ?? unavailableClaimSourceIds(analysis),
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
    issues: analysis.issues ?? [],
    conflicts: analysis.conflicts,
    sources: analysis.sources,
  };
}

async function safeCapability<T>(
  issues: DataIssue[],
  capability: string,
  code: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isQVerisCapabilityError(error)) throw error;
    issues.push(dataIssue(capability, code, error));
    return fallback;
  }
}

function stateForIssue(
  issues: DataIssue[],
  capability: string,
  value: unknown,
  options: { demo?: boolean; partial?: boolean } = {},
) {
  return issues.some((issue) => issue.capability === capability) ? "unavailable" : stateFor(value, options);
}

function missingSourceIssue(id: string): DataIssue {
  return {
    capability: "sourceAudit",
    code: "SOURCE_REF_MISSING",
    toolId: id,
    retryable: false,
    occurredAt: new Date().toISOString(),
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

function hasEvidence(values: unknown[]) {
  return values.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
}

function resolveRequestedMode(requested: string, detected: ResolvedAnalysisMode): ResolvedAnalysisMode {
  if (requested === "auto") return detected;
  if (["preview", "flash", "call_intelligence", "combined", "no_event"].includes(requested)) {
    return requested as ResolvedAnalysisMode;
  }
  return detected;
}

type NarrativeSection = "summaryBullets" | "keyDrivers" | "riskSignals" | "qualityOfEarnings" | "watchNext";
type GeneratedNarrative = Pick<EarningsAnalysis, NarrativeSection> & {
  claimSourceIds: Omit<EarningsClaimSourceIds, "oneLineVerdict">;
};

function mergeGenerated<T extends GeneratedNarrative>(
  deterministic: T,
  ai: Partial<GeneratedNarrative> | null,
  validSourceIds: Set<string>,
): T {
  if (!ai) return deterministic;
  const merged = { ...deterministic, claimSourceIds: { ...deterministic.claimSourceIds } };
  for (const section of ["summaryBullets", "keyDrivers", "riskSignals", "qualityOfEarnings", "watchNext"] as const) {
    const accepted = acceptAiSection(section, deterministic, ai, validSourceIds);
    if (accepted.items.length) {
      merged[section] = accepted.items as T[typeof section];
      merged.claimSourceIds[section] = accepted.sourceIds;
    }
  }
  return merged;
}

function acceptAiSection(
  section: NarrativeSection,
  deterministic: GeneratedNarrative,
  ai: Partial<GeneratedNarrative>,
  validSourceIds: Set<string>,
) {
  const items = ai[section] ?? [];
  const sourceIds = ai.claimSourceIds?.[section] ?? [];
  const acceptedItems: string[] = [];
  const acceptedSourceIds: ClaimSourceIds[] = [];
  items.forEach((item, index) => {
    const deterministicIndex = deterministic[section].indexOf(item);
    if (deterministicIndex === -1) return;
    const deterministicIds = normalizeClaimSourceIds(deterministic.claimSourceIds[section][deterministicIndex], validSourceIds, true);
    const ids = normalizeClaimSourceIds(sourceIds[index], validSourceIds, true);
    if (deterministicIds === "unavailable" || ids === "unavailable" || !ids.every((id) => deterministicIds.includes(id))) return;
    acceptedItems.push(item);
    acceptedSourceIds.push(ids);
  });
  return { items: acceptedItems, sourceIds: acceptedSourceIds };
}

function buildDeterministicClaimSourceIds(
  generated: Pick<EarningsAnalysis, NarrativeSection>,
  input: {
    company?: EarningsAnalysis["company"];
    event?: EarningsAnalysis["event"];
    detected: ReturnType<typeof detectEarningsMode>;
    estimates?: EarningsAnalysis["estimates"];
    results?: EarningsAnalysis["results"];
    quote?: EarningsAnalysis["quote"];
    marketReaction?: EarningsAnalysis["marketReaction"];
    financials: EarningsAnalysis["financials"];
    eventFinancials?: EarningsAnalysis["financials"][number];
    eventSegments?: EarningsAnalysis["segmentRevenue"][number];
    transcript?: EarningsAnalysis["transcript"];
    historicalPattern: EarningsAnalysis["historicalPattern"];
    news: EarningsAnalysis["news"];
    filings: EarningsAnalysis["filings"];
  },
  validSourceIds: Set<string>,
): Omit<EarningsClaimSourceIds, "oneLineVerdict"> {
  return {
    summaryBullets: generated.summaryBullets.map((item) => sourceIdsForClaim(item, "summaryBullets", input, validSourceIds)),
    keyDrivers: generated.keyDrivers.map((item) => sourceIdsForClaim(item, "keyDrivers", input, validSourceIds)),
    riskSignals: generated.riskSignals.map((item) => sourceIdsForClaim(item, "riskSignals", input, validSourceIds)),
    qualityOfEarnings: generated.qualityOfEarnings.map((item) => sourceIdsForClaim(item, "qualityOfEarnings", input, validSourceIds)),
    watchNext: generated.watchNext.map((item) => sourceIdsForClaim(item, "watchNext", input, validSourceIds)),
  };
}

function sourceIdsForClaim(
  text: string,
  section: NarrativeSection,
  input: Parameters<typeof buildDeterministicClaimSourceIds>[1],
  validSourceIds: Set<string>,
): ClaimSourceIds {
  const lower = text.toLowerCase();
  if (lower.includes("revenue estimate") || text.includes("营收一致预期")) return validClaimSourceIds(input.estimates?.fieldSourceIds?.revenueEstimate ?? input.estimates?.sourceIds, validSourceIds);
  if (lower.includes("eps estimate") || text.includes("EPS 一致预期")) return validClaimSourceIds(input.estimates?.fieldSourceIds?.epsEstimate ?? input.estimates?.sourceIds, validSourceIds);
  if (lower.includes("recently reported") || text.includes("已发布财报")) return validClaimSourceIds(sourceIds(input.results, input.estimates), validSourceIds);
  if (lower.includes("guidance") || lower.includes("指引")) return validClaimSourceIds(input.results?.fieldSourceIds?.guidanceText ?? input.results?.sourceIds, validSourceIds);
  if (lower.includes("historical") || lower.includes("历史")) return validClaimSourceIds(sourceIds(...input.historicalPattern), validSourceIds);
  if (lower.includes("transcript") || lower.includes("电话会")) return validClaimSourceIds(input.transcript?.sourceIds, validSourceIds);
  if (lower.includes("news") || lower.includes("新闻")) return validClaimSourceIds(sourceIds(...input.news), validSourceIds);
  if (lower.includes("gross margin") || lower.includes("free-cash-flow") || lower.includes("balance-sheet") || lower.includes("毛利率") || lower.includes("自由现金流") || lower.includes("资产负债表")) return validClaimSourceIds(input.eventFinancials?.sourceIds, validSourceIds);
  if (lower.includes("segment") || lower.includes("分部")) return validClaimSourceIds(input.eventSegments?.sourceIds ?? input.results?.fieldSourceIds?.segmentHighlights ?? input.results?.sourceIds, validSourceIds);
  if (lower.includes("filing") || lower.includes("公告")) return validClaimSourceIds(sourceIds(...input.filings), validSourceIds);
  if (lower.includes("upcoming earnings") || text.includes("即将发布财报")) return validClaimSourceIds(sourceIds(input.company, input.event, input.detected.upcomingEvent, input.estimates, input.quote), validSourceIds);
  if (section === "keyDrivers") return validClaimSourceIds(sourceIds(input.results, input.estimates, input.transcript, ...input.news), validSourceIds);
  return "unavailable";
}

function oneLineSourceIds(
  verdict: string,
  generated: GeneratedNarrative,
  event: EarningsAnalysis["event"],
  validSourceIds: Set<string>,
): ClaimSourceIds {
  return verdict === generated.summaryBullets[0]
    ? generated.claimSourceIds.summaryBullets[0] ?? "unavailable"
    : validClaimSourceIds(event?.sourceIds, validSourceIds);
}

function sourceIds(...items: Array<{ sourceIds?: string[] } | null | undefined>) {
  return [...new Set(items.flatMap((item) => item?.sourceIds ?? []))];
}

function validClaimSourceIds(ids: string[] | undefined, validSourceIds: Set<string>): ClaimSourceIds {
  return normalizeClaimSourceIds(ids, validSourceIds, false);
}

function normalizeClaimSourceIds(ids: ClaimSourceIds | string[] | undefined, validSourceIds: Set<string>, strict: boolean): ClaimSourceIds {
  if (!Array.isArray(ids) || !ids.length) return "unavailable";
  if (strict && ids.some((id) => !validSourceIds.has(id))) return "unavailable";
  const valid = [...new Set(ids.filter((id) => validSourceIds.has(id)))];
  return valid.length ? valid : "unavailable";
}

function lowerConfidenceForSourceAudit(
  confidence: EarningsAnalysis["confidence"],
  missingSourceIds: string[],
  language: EarningsAnalysis["language"],
): EarningsAnalysis["confidence"] {
  if (!missingSourceIds.length || confidence.label === "low") return confidence;
  return {
    label: "low",
    reason: language === "zh"
      ? `${confidence.reason} 来源审计缺少 ${missingSourceIds.length} 个 source ref。`
      : `${confidence.reason} Source audit is missing ${missingSourceIds.length} source ref(s).`,
  };
}

function unavailableClaimSourceIds(analysis: Pick<EarningsAnalysis, NarrativeSection | "oneLineVerdict">): EarningsClaimSourceIds {
  return {
    oneLineVerdict: "unavailable",
    summaryBullets: analysis.summaryBullets.map(() => "unavailable"),
    keyDrivers: analysis.keyDrivers.map(() => "unavailable"),
    riskSignals: analysis.riskSignals.map(() => "unavailable"),
    qualityOfEarnings: analysis.qualityOfEarnings.map(() => "unavailable"),
    watchNext: analysis.watchNext.map(() => "unavailable"),
  };
}
