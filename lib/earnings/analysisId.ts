import type { AnalyzeEarningsRequest, EarningsAnalysis } from "@/lib/earnings/types";

export function buildAnalysisId(input: Pick<EarningsAnalysis, "ticker" | "mode" | "generatedAt">) {
  return `${input.ticker}-${input.mode}-${compactTimestamp(input.generatedAt)}`;
}

export function requestKey(request: AnalyzeEarningsRequest) {
  return JSON.stringify({
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
  return value.replace(/[-:.]/g, "").replace(/\.\d+Z$/, "Z");
}
