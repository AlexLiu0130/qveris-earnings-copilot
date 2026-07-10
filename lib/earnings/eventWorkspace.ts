import type { CapabilityState, EarningsAnalysis, EarningsEvent } from "@/lib/earnings/types";
import type { Lang } from "@/lib/i18n/dict";

type StatusKey =
  | "setup"
  | "print"
  | "variance"
  | "callRead"
  | "thesisImpact"
  | "qualityCheck"
  | "sourceAudit"
  | "output";
type ChangeKey = "revenue" | "eps" | "guidance" | "managementTone";
type Input = Pick<
  EarningsAnalysis,
  "event" | "results" | "filings" | "transcript" | "summaryBullets" | "historicalPattern"
> &
  Partial<
    Pick<
      EarningsAnalysis,
      "upcomingEvent" | "recentEvent" | "estimates" | "news" | "quote" | "keyDrivers" | "riskSignals" | "qualityOfEarnings" | "sources" | "conflicts"
    >
>;

export function buildEventStatus(input: Input, lang: Lang = "en") {
  const event = input.recentEvent ?? input.upcomingEvent ?? input.event;
  const setupSourceIds = sourceIds(event, input.estimates, input.quote, ...input.historicalPattern);
  const printSourceIds = sourceIds(input.results, ...input.filings, input.transcript, ...(input.news ?? []));
  const outputAvailable = input.summaryBullets.length > 0;

  return [
    step("setup", lang === "zh" ? "财报前准备" : "Pre-print setup", event ? "available" : "unavailable", setupSourceIds),
    step("print", lang === "zh" ? "财报数据拉取" : "Print ingestion", printSourceIds.length ? "available" : "unavailable", printSourceIds),
    step("variance", lang === "zh" ? "预期差分析" : "Variance table", input.results ? "available" : "unavailable", input.results?.sourceIds),
    step("callRead", lang === "zh" ? "电话会解读" : "Call read", input.transcript?.available ? "available" : "unavailable", input.transcript?.sourceIds),
    step("thesisImpact", lang === "zh" ? "逻辑影响" : "Thesis impact", input.keyDrivers?.length || input.summaryBullets.length ? "available" : "unavailable", []),
    step("qualityCheck", lang === "zh" ? "质量检查" : "Quality check", input.qualityOfEarnings?.length || input.riskSignals?.length ? "available" : "unavailable", []),
    step("sourceAudit", lang === "zh" ? "来源审计" : "Source audit", input.conflicts?.length ? "conflict" : input.sources?.length ? "available" : "unavailable", input.sources?.map((item) => item.id)),
    step("output", lang === "zh" ? "生成输出" : "Output generated", outputAvailable ? "available" : "unavailable", []),
  ];
}

export function buildWhatChanged(input: Input, lang: Lang = "en") {
  const previous = input.historicalPattern.find((row) => row.reportDate !== input.event?.reportDate);
  return [
    change("revenue", lang === "zh" ? "营收" : "Revenue", input.results?.revenueActual, previous?.revenueActual, input.results?.sourceIds),
    change("eps", "EPS", input.results?.epsActual, previous?.epsActual, input.results?.sourceIds),
    change("guidance", lang === "zh" ? "业绩指引" : "Guidance", input.results?.guidanceText, undefined, input.results?.sourceIds),
    change("managementTone", lang === "zh" ? "管理层语气" : "Management tone", input.transcript?.managementTone, undefined, input.transcript?.sourceIds),
  ];
}

export function oneLineVerdict(summaryBullets: string[], event?: EarningsEvent | null, lang: Lang = "en") {
  return summaryBullets[0] ?? (event
    ? (lang === "zh" ? `${event.ticker} 财报事件可用，但研究简报仍不完整。` : `${event.ticker} earnings event is available, but the brief is still incomplete.`)
    : (lang === "zh" ? "近期未发现财报事件。" : "No near-term earnings event found."));
}

function step(key: StatusKey, label: string, state: CapabilityState, sourceIds: string[] = []) {
  return { key, label, state, sourceIds };
}

function sourceIds(...items: Array<{ sourceIds?: string[] } | null | undefined>) {
  return [...new Set(items.flatMap((item) => item?.sourceIds ?? []))];
}

function change(
  key: ChangeKey,
  label: string,
  current: number | string | undefined,
  previous: number | string | undefined,
  sourceIds: string[] = [],
) {
  return { key, label, current, previous, direction: direction(current, previous), sourceIds };
}

function direction(current: number | string | undefined, previous: number | string | undefined): "up" | "down" | "flat" | "unavailable" {
  if (typeof current === "number" && typeof previous === "number") {
    if (current > previous) return "up";
    if (current < previous) return "down";
    return "flat";
  }
  return current == null ? "unavailable" : "flat";
}
