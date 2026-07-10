import { computeEpsBeatMiss, computeRevenueBeatMiss } from "@/lib/earnings/computeBeatMiss";
import type { HistoricalEarnings, HistoricalPatternSummary } from "@/lib/earnings/types";

export function computeHistoricalPattern(history: HistoricalEarnings[]): HistoricalPatternSummary {
  const revenueRows = history.filter((row) => row.revenueActual != null && row.revenueEstimate != null);
  const epsRows = history.filter((row) => row.epsActual != null && row.epsEstimate != null);
  const revenueBeatCount = revenueRows.filter((row) => computeRevenueBeatMiss(row.revenueActual, row.revenueEstimate) === "beat").length;
  const epsBeatCount = epsRows.filter((row) => computeEpsBeatMiss(row.epsActual, row.epsEstimate) === "beat").length;
  const oneDayMoves = values(history.map((row) => row.oneDayMovePct));
  const fiveDayMoves = values(history.map((row) => row.fiveDayMovePct));

  return {
    revenueBeatCount,
    epsBeatCount,
    revenueDataPoints: revenueRows.length,
    epsDataPoints: epsRows.length,
    quarters: history.length,
    averageOneDayMovePct: average(oneDayMoves),
    averageFiveDayMovePct: average(fiveDayMoves),
    largestPositiveMovePct: oneDayMoves.length ? Math.max(...oneDayMoves) : undefined,
    largestNegativeMovePct: oneDayMoves.length ? Math.min(...oneDayMoves) : undefined,
    limitedHistory: history.length < 4,
  };
}

function values(input: Array<number | undefined>) {
  return input.filter((value): value is number => Number.isFinite(value));
}

function average(input: number[]) {
  if (input.length === 0) return undefined;
  return input.reduce((sum, value) => sum + value, 0) / input.length;
}
