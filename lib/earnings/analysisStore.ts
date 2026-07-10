import type { AnalyzeEarningsRequest, EarningsAnalysis } from "@/lib/earnings/types";
import { requestKey } from "@/lib/earnings/analysisId";

const TTL_MS = 30 * 60_000;
const MAX_ITEMS = 200;

interface CacheEntry {
  key: string;
  analysis: EarningsAnalysis;
  expiresAt: number;
}

const byId = new Map<string, CacheEntry>();
const byRequest = new Map<string, string>();

export function saveAnalysis(request: AnalyzeEarningsRequest, analysis: EarningsAnalysis) {
  evictExpired();
  const key = requestKey(request);
  byId.set(analysis.analysisId, { key, analysis, expiresAt: Date.now() + TTL_MS });
  byRequest.set(key, analysis.analysisId);
  evictOverflow();
}

export function getAnalysisById(analysisId: string) {
  evictExpired();
  return byId.get(analysisId)?.analysis ?? null;
}

export function getCachedAnalysis(request: AnalyzeEarningsRequest) {
  evictExpired();
  const analysisId = byRequest.get(requestKey(request));
  return analysisId ? byId.get(analysisId)?.analysis ?? null : null;
}

function evictExpired() {
  const now = Date.now();
  for (const [id, entry] of byId.entries()) {
    if (entry.expiresAt > now) continue;
    byId.delete(id);
    if (byRequest.get(entry.key) === id) byRequest.delete(entry.key);
  }
}

function evictOverflow() {
  while (byId.size > MAX_ITEMS) {
    const first = byId.keys().next().value as string | undefined;
    if (!first) return;
    const entry = byId.get(first);
    byId.delete(first);
    if (entry && byRequest.get(entry.key) === first) byRequest.delete(entry.key);
  }
}
