import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";
import { getAnalysisById, getCachedAnalysis, saveAnalysis } from "@/lib/earnings/analysisStore";
import type { AnalyzeEarningsRequest, EarningsAnalysis } from "@/lib/earnings/types";

interface ResolveAnalysisDeps {
  getAnalysisById: (analysisId: string) => Promise<EarningsAnalysis | null>;
  getCachedAnalysis: (request: AnalyzeEarningsRequest) => Promise<EarningsAnalysis | null>;
  analyzeEarnings: (request: AnalyzeEarningsRequest) => Promise<EarningsAnalysis>;
  saveAnalysis: (request: AnalyzeEarningsRequest, analysis: EarningsAnalysis) => Promise<void>;
}

const defaultDeps: ResolveAnalysisDeps = {
  getAnalysisById,
  getCachedAnalysis,
  analyzeEarnings,
  saveAnalysis,
};

export async function resolveAnalysis(
  request: AnalyzeEarningsRequest,
  analysisId?: string,
  deps: ResolveAnalysisDeps = defaultDeps,
) {
  const id = analysisId?.trim();
  const stored = id ? await deps.getAnalysisById(id) : null;
  // Explicit analysisId is a snapshot permalink; replay it exactly for the matching ticker.
  if (stored && sameTicker(request.ticker, stored.ticker)) return stored;

  const cached = await deps.getCachedAnalysis(request);
  if (cached) return cached;

  const analysis = await deps.analyzeEarnings(request);
  await deps.saveAnalysis(request, analysis);
  return analysis;
}

function sameTicker(left: string, right: string) {
  return normalizeTicker(left) === normalizeTicker(right);
}

function normalizeTicker(ticker: string) {
  return ticker.trim().replace(/^\$/, "").toUpperCase();
}
