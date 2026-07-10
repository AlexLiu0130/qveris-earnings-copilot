import type { AnalyzeEarningsRequest, AnalysisMode } from "@/lib/earnings/types";

const MODES = new Set<AnalysisMode>(["auto", "preview", "flash", "call_intelligence", "combined", "no_event"]);

export function validateAnalyzeRequest(input: unknown): AnalyzeEarningsRequest {
  if (!input || typeof input !== "object") throw new Error("INVALID_REQUEST");
  const raw = input as Record<string, unknown>;
  if (typeof raw.ticker !== "string") throw new Error("INVALID_TICKER");
  const ticker = raw.ticker.trim().toUpperCase().replace(/^\$/, "");
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error("INVALID_TICKER");
  const mode = typeof raw.mode === "string" && MODES.has(raw.mode as AnalysisMode) ? raw.mode as AnalysisMode : "auto";
  const language = raw.language === "zh" ? "zh" : "en";
  return {
    ticker,
    mode,
    language,
    includeSources: raw.includeSources !== false,
    includeHistoricalPattern: raw.includeHistoricalPattern !== false,
    includeNews: raw.includeNews !== false,
    includeFilings: raw.includeFilings !== false,
    includeTranscript: raw.includeTranscript !== false,
    includeAiSummary: raw.includeAiSummary !== false,
    maxNewsItems: clampNumber(raw.maxNewsItems, 5, 0, 20),
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
