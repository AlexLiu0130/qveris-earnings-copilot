import type { BeatMiss, EarningsEstimates, EarningsResults, GuidanceVerdict } from "@/lib/earnings/types";

export function computeRevenueBeatMiss(actual?: number, estimate?: number): BeatMiss {
  if (actual == null || estimate == null) return "unavailable";
  if (actual > estimate * 1.002) return "beat";
  if (actual < estimate * 0.998) return "miss";
  return "inline";
}

export function computeEpsBeatMiss(actual?: number, estimate?: number): BeatMiss {
  if (actual == null || estimate == null) return "unavailable";
  if (actual > estimate) return "beat";
  if (actual < estimate) return "miss";
  return "inline";
}

export function computeBeatMiss(results?: EarningsResults | null, estimates?: EarningsEstimates | null) {
  return {
    revenue: computeRevenueBeatMiss(results?.revenueActual, estimates?.revenueEstimate),
    eps: computeEpsBeatMiss(results?.epsActual, estimates?.epsEstimate),
    guidance: classifyGuidance(results?.guidanceText),
  };
}

export function classifyGuidance(text?: string): GuidanceVerdict {
  if (!text) return "unavailable";
  const lower = text.toLowerCase();
  if (/\b(raise|raised|higher|above|increase|increased)\b/.test(lower) || /上调|提高/.test(text)) return "raised";
  if (/\b(lower|lowered|below|cut|reduced|decrease|decreased)\b/.test(lower) || /下调|降低/.test(text)) return "lowered";
  if (/\b(maintain|maintained|reaffirm|reaffirmed|unchanged)\b/.test(lower) || /维持|重申|不变/.test(text)) return "maintained";
  return "provided";
}
