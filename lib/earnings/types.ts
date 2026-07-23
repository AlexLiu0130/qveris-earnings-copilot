export type ConfidenceLabel = "high" | "medium" | "low";
export type EarningsTiming = "before_open" | "after_close" | "during_market" | "unknown";
export type BeatMiss = "beat" | "miss" | "inline" | "unavailable";
export type GuidanceVerdict = "raised" | "lowered" | "maintained" | "provided" | "unavailable";
export type CapabilityState = "available" | "partial" | "unavailable" | "conflict" | "demo";
export type AnalysisMode = "auto" | "preview" | "flash" | "call_intelligence" | "combined" | "no_event";
export type ResolvedAnalysisMode = Exclude<AnalysisMode, "auto">;

export interface DataIssue {
  capability: string;
  code: string;
  errorType?: string;
  statusCode?: number;
  toolId?: string;
  retryable: boolean;
  occurredAt: string;
}

export interface SourceRef {
  id: string;
  title: string;
  provider?: string;
  url?: string;
  publishedAt?: string;
  retrievedAt: string;
  capability?: string;
  executionId?: string;
}

export type ClaimSourceIds = string[] | "unavailable";
export type InterpretationEvidenceType = "fact" | "inference" | "to_verify" | "unverified";
export type InterpretationMode = "company" | "ecosystem";
export type InterpretationRole =
  | "company_only"
  | "demand_initiator"
  | "upstream_supplier"
  | "infrastructure_enabler"
  | "downstream_monetizer"
  | "peer_or_competitor";

export interface EarningsInterpretationClaim {
  text: string;
  evidenceType: InterpretationEvidenceType;
  sourceIds: ClaimSourceIds;
  confidence: ConfidenceLabel;
  rationale?: string;
  counterEvidence?: string;
  nextEvidence?: string;
  lag?: string;
}

export interface EarningsInterpretationEdge extends EarningsInterpretationClaim {
  from: string;
  to: string;
  relation: string;
  lag: string;
}

export interface EarningsInterpretation {
  status: "available" | "unavailable";
  mode: InterpretationMode;
  role?: InterpretationRole;
  archetype?: string;
  conclusion?: EarningsInterpretationClaim;
  companyDrivers: EarningsInterpretationClaim[];
  transmissionChain: EarningsInterpretationEdge[];
  counterEvidence: EarningsInterpretationClaim[];
  watchItems: EarningsInterpretationClaim[];
  confidence: {
    label: ConfidenceLabel;
    reason: string;
  };
  agent?: {
    contractVersion: "earnings_research_agent_v1";
    baseAnalysisId?: string;
    stages: Array<{
      key: "evidence" | "route" | "research" | "audit";
      state: "completed" | "degraded" | "skipped";
      detail: string;
    }>;
    acceptedClaims: number;
    rejectedClaims: number;
  };
  reason?: string;
}

export type AiInterpretation = EarningsInterpretation;

export interface EarningsClaimSourceIds {
  oneLineVerdict: ClaimSourceIds;
  summaryBullets: ClaimSourceIds[];
  keyDrivers: ClaimSourceIds[];
  riskSignals: ClaimSourceIds[];
  qualityOfEarnings: ClaimSourceIds[];
  watchNext: ClaimSourceIds[];
}

export interface CompanyProfile {
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  currency?: string;
  sourceIds: string[];
}

export interface EarningsEvent {
  id: string;
  ticker: string;
  fiscalPeriod?: string;
  fiscalYear?: number;
  reportDate: string;
  timing: EarningsTiming;
  status: "upcoming" | "reported" | "unknown";
  revenueActual?: number;
  epsActual?: number;
  revenueEstimate?: number;
  epsEstimate?: number;
  sourceIds: string[];
}

export interface EarningsEstimates {
  ticker: string;
  eventId?: string;
  revenueEstimate?: number;
  revenueEstimateBasis?: "consensus" | "company_guidance_midpoint";
  epsEstimate?: number;
  epsCurrency?: string;
  revenueGrowthEstimateYoY?: number;
  epsGrowthEstimateYoY?: number;
  estimateCount?: number;
  sourceIds: string[];
  fieldSourceIds?: Partial<Record<"revenueEstimate" | "epsEstimate" | "estimateCount", string[]>>;
}

export interface EarningsResults {
  ticker: string;
  eventId?: string;
  revenueActual?: number;
  epsActual?: number;
  epsCurrency?: string;
  grossMargin?: number; // ratio: 0.54 means 54%
  operatingMargin?: number; // ratio: 0.24 means 24%
  netIncome?: number;
  guidanceText?: string;
  segmentHighlights?: string[];
  sourceIds: string[];
  fieldSourceIds?: Partial<Record<
    "revenueActual" | "epsActual" | "grossMargin" | "operatingMargin" | "netIncome" | "guidanceText" | "segmentHighlights",
    string[]
  >>;
}

export interface HistoricalEarnings {
  eventId: string;
  fiscalPeriod?: string;
  reportDate: string;
  revenueActual?: number;
  revenueEstimate?: number;
  epsActual?: number;
  epsEstimate?: number;
  oneDayMovePct?: number;
  fiveDayMovePct?: number;
  sourceIds: string[];
  fieldSourceIds?: Partial<Record<"revenueActual" | "revenueEstimate" | "epsActual" | "epsEstimate" | "oneDayMovePct" | "fiveDayMovePct", string[]>>;
}

export interface StockQuote {
  ticker: string;
  price?: number;
  changePct?: number;
  afterHoursChangePct?: number;
  preMarketChangePct?: number;
  volume?: number;
  avgVolume30d?: number;
  timestamp: string;
  sourceIds: string[];
}

export interface PriceBar {
  date: string;
  open?: number;
  close?: number;
  volume?: number;
  sourceIds: string[];
}

export interface MarketReaction {
  eventDate: string;
  baselineSessionDate: string;
  reactionSessionDate: string;
  basis: "same_session" | "next_session";
  baselineClose?: number;
  reactionOpen?: number;
  reactionClose?: number;
  openGapPct?: number;
  closeChangePct?: number;
  volume?: number;
  sourceIds: string[];
}

export interface FinancialStatementPeriod {
  date: string;
  fiscalYear?: number;
  period?: string;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  grossMargin?: number; // ratio: 0.54 means 54%
  operatingMargin?: number; // ratio: 0.24 means 24%
  operatingCashFlow?: number;
  freeCashFlow?: number;
  capitalExpenditure?: number;
  inventory?: number;
  accountsReceivable?: number;
  totalDebt?: number;
  cashAndEquivalents?: number;
  sourceIds: string[];
  fieldSourceIds?: Partial<Record<"revenue" | "grossMargin" | "operatingMargin" | "netIncome", string[]>>;
}

export interface SegmentRevenue {
  date: string;
  fiscalYear?: number;
  period?: string;
  segments: Array<{ name: string; revenue: number }>;
  sourceIds: string[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  url?: string;
  publishedAt?: string;
  provider?: string;
  sourceIds: string[];
}

export interface FilingItem {
  id: string;
  formType: "10-K" | "10-Q" | "8-K" | "DEF 14A" | "other";
  filedAt: string;
  title?: string;
  url?: string;
  summary?: string;
  sourceIds: string[];
}

export interface TranscriptInsight {
  available: boolean;
  managementTone?: "more_positive" | "neutral" | "more_negative" | "unavailable";
  guidanceTone?: "more_positive" | "neutral" | "more_negative" | "unavailable";
  riskLanguage?: "increased" | "unchanged" | "decreased" | "unavailable";
  repeatedQuestions?: string[];
  questionTranslations?: string[];
  managementAnswers?: Array<{ topic: string; answer: string; topicTranslation?: string; answerTranslation?: string; sourceIds: string[] }>;
  keyQuotes?: Array<{ text: string; speaker?: string; sourceIds: string[] }>;
  sourceIds: string[];
}

export interface AnalystRevision {
  id: string;
  ticker: string;
  metric: "revenue" | "eps" | "other";
  direction: "up" | "down" | "unchanged";
  summary: string;
  publishedAt?: string;
  sourceIds: string[];
}

export interface EarningsCalendarParams {
  from: string;
  to: string;
  universe?: string;
  sector?: string;
  status?: "upcoming" | "reported" | "unknown";
  timing?: EarningsTiming;
  minMarketCap?: number;
}

export interface HistoricalPriceParams {
  from: string;
  to: string;
}

export interface NewsParams {
  limit?: number;
  from?: string;
  to?: string;
}

export interface FilingParams {
  limit?: number;
  from?: string;
  to?: string;
  formTypes?: FilingItem["formType"][];
}

export interface AnalystParams {
  limit?: number;
  from?: string;
  to?: string;
}

export interface HistoricalPatternSummary {
  revenueBeatCount: number;
  epsBeatCount: number;
  revenueDataPoints: number;
  epsDataPoints: number;
  quarters: number;
  averageOneDayMovePct?: number;
  averageFiveDayMovePct?: number;
  largestPositiveMovePct?: number;
  largestNegativeMovePct?: number;
  limitedHistory: boolean;
}

export interface EarningsAnalysis {
  analysisId: string;
  ticker: string;
  language: "en" | "zh";
  mode: ResolvedAnalysisMode;
  company?: CompanyProfile | null;
  event?: EarningsEvent | null;
  upcomingEvent?: EarningsEvent | null;
  recentEvent?: EarningsEvent | null;
  estimates?: EarningsEstimates | null;
  results?: EarningsResults | null;
  quote?: StockQuote | null;
  marketReaction?: MarketReaction | null;
  financials: FinancialStatementPeriod[];
  segmentRevenue: SegmentRevenue[];
  historicalPattern: HistoricalEarnings[];
  historicalSummary: HistoricalPatternSummary;
  news: NewsItem[];
  filings: FilingItem[];
  transcript?: TranscriptInsight | null;
  analystRevisions: AnalystRevision[];
  beatMiss?: {
    revenue: BeatMiss;
    eps: BeatMiss;
    guidance: GuidanceVerdict;
  };
  oneLineVerdict: string;
  eventStatus: Array<{
    key: "setup" | "print" | "variance" | "callRead" | "thesisImpact" | "qualityCheck" | "sourceAudit" | "output";
    label: string;
    state: CapabilityState;
    sourceIds: string[];
  }>;
  whatChanged: Array<{
    key: "revenue" | "eps" | "guidance" | "managementTone";
    label: string;
    current?: number | string;
    previous?: number | string;
    direction: "up" | "down" | "flat" | "unavailable";
    sourceIds: string[];
  }>;
  keyQuestions: string[];
  keyDrivers: string[];
  riskSignals: string[];
  qualityOfEarnings: string[];
  summaryBullets: string[];
  watchNext: string[];
  interpretation?: EarningsInterpretation;
  claimSourceIds?: EarningsClaimSourceIds;
  confidence: {
    label: ConfidenceLabel;
    reason: string;
  };
  caveats: string[];
  capabilityStatus: Record<string, CapabilityState>;
  missing: string[];
  issues?: DataIssue[];
  conflicts: string[];
  sources: SourceRef[];
  generatedAt: string;
  demo?: boolean;
}

export interface AnalyzeEarningsRequest {
  ticker: string;
  mode?: AnalysisMode;
  language?: "en" | "zh";
  includeSources?: boolean;
  includeHistoricalPattern?: boolean;
  includeNews?: boolean;
  includeFilings?: boolean;
  includeTranscript?: boolean;
  includeAiSummary?: boolean;
  includeAiInterpretation?: boolean;
  maxNewsItems?: number;
}

export interface AnalyzeEarningsResponse {
  analysisId: string;
  ticker: string;
  language: "en" | "zh";
  mode: ResolvedAnalysisMode;
  generatedAt: string;
  analysis: Pick<
    EarningsAnalysis,
    | "summaryBullets"
    | "oneLineVerdict"
    | "eventStatus"
    | "whatChanged"
    | "keyQuestions"
    | "keyDrivers"
    | "riskSignals"
    | "qualityOfEarnings"
    | "watchNext"
    | "interpretation"
    | "claimSourceIds"
    | "confidence"
    | "caveats"
  >;
  data: Omit<
    EarningsAnalysis,
    | "summaryBullets"
    | "oneLineVerdict"
    | "eventStatus"
    | "whatChanged"
    | "keyQuestions"
    | "keyDrivers"
    | "riskSignals"
    | "qualityOfEarnings"
    | "watchNext"
    | "interpretation"
    | "claimSourceIds"
    | "confidence"
    | "caveats"
    | "capabilityStatus"
    | "missing"
    | "conflicts"
    | "sources"
    | "analysisId"
    | "generatedAt"
    | "mode"
  >;
  capabilityStatus: Record<string, CapabilityState>;
  missing: string[];
  issues: DataIssue[];
  conflicts: string[];
  sources: SourceRef[];
}
