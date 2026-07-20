import type { AnalyzeEarningsRequest, EarningsAnalysis } from "@/lib/earnings/types";

const ANALYSIS_ID_SEQUENCE_KEY = Symbol.for("qveris.earnings.analysisId.sequence.v1");
const ANALYSIS_PIPELINE_VERSION = 2;

export function buildAnalysisId(input: Pick<EarningsAnalysis, "ticker" | "mode" | "generatedAt">) {
  const base = `${normalizeTicker(input.ticker)}-${input.mode}-${compactTimestamp(input.generatedAt)}`;
  return `${base}-${nextSequence().toString(36).padStart(2, "0")}`;
}

export function requestKey(request: AnalyzeEarningsRequest) {
  return JSON.stringify({
    analysisPipelineVersion: ANALYSIS_PIPELINE_VERSION,
    ticker: request.ticker.trim().toUpperCase().replace(/^\$/, ""),
    mode: request.mode ?? "auto",
    language: request.language ?? "en",
    includeSources: request.includeSources ?? true,
    includeHistoricalPattern: request.includeHistoricalPattern ?? true,
    includeNews: request.includeNews ?? true,
    includeFilings: request.includeFilings ?? true,
    includeTranscript: request.includeTranscript ?? true,
    includeAiSummary: request.includeAiSummary ?? true,
    maxNewsItems: Math.min(Math.max(request.maxNewsItems ?? 5, 0), 20),
  });
}

function compactTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isFinite(timestamp.getTime())) {
    return timestamp.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
  }
  return value.replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
}

function normalizeTicker(value: string) {
  return value.trim().toUpperCase().replace(/^\$/, "");
}

function nextSequence() {
  const global = globalThis as typeof globalThis & Partial<Record<symbol, number>>;
  const sequence = (global[ANALYSIS_ID_SEQUENCE_KEY] ?? 0) + 1;
  global[ANALYSIS_ID_SEQUENCE_KEY] = sequence;
  return sequence;
}
