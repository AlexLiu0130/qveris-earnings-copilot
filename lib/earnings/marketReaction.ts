import type { EarningsEvent, MarketReaction, PriceBar } from "@/lib/earnings/types";

export function buildMarketReaction(event?: EarningsEvent | null, bars: PriceBar[] = []): MarketReaction | null {
  if (!event || event.status !== "reported" || event.timing === "unknown") return null;
  const sessions = [...bars]
    .filter((bar): bar is PriceBar & { close: number } => bar.close != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  let reactionIndex: number;
  if (event.timing === "after_close") {
    const baselineIndex = sessions.map((bar) => bar.date <= event.reportDate).lastIndexOf(true);
    reactionIndex = baselineIndex + 1;
  } else {
    reactionIndex = sessions.findIndex((bar) => bar.date >= event.reportDate);
  }

  const baseline = sessions[reactionIndex - 1];
  const reaction = sessions[reactionIndex];
  if (!baseline || !reaction || baseline.close === 0) return null;

  return {
    eventDate: event.reportDate,
    baselineSessionDate: baseline.date,
    reactionSessionDate: reaction.date,
    basis: reaction.date === event.reportDate ? "same_session" : "next_session",
    baselineClose: baseline.close,
    reactionOpen: reaction.open,
    reactionClose: reaction.close,
    openGapPct: reaction.open == null ? undefined : ((reaction.open - baseline.close) / Math.abs(baseline.close)) * 100,
    closeChangePct: ((reaction.close - baseline.close) / Math.abs(baseline.close)) * 100,
    volume: reaction.volume,
    sourceIds: [...new Set([...baseline.sourceIds, ...reaction.sourceIds])],
  };
}
