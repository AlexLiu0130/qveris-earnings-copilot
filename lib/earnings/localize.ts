import type { Lang } from "@/lib/i18n/dict";
import type { SourceRef, TranscriptInsight } from "@/lib/earnings/types";

const SOURCE_TITLES_ZH: Record<string, string> = {
  get_company_profile: "QVeris 公司档案",
  get_earnings_calendar: "QVeris 财报日历",
  get_earnings_estimates: "QVeris 一致预期",
  get_historical_earnings: "QVeris 历史财报",
  get_stock_quote: "QVeris 延迟行情",
  get_historical_prices: "QVeris 复权日线行情",
  get_income_statement: "QVeris 利润表",
  get_balance_sheet: "QVeris 资产负债表",
  get_cash_flow: "QVeris 现金流量表",
  get_revenue_segments: "QVeris 分部收入",
  get_financial_news: "QVeris 财经新闻聚合",
  get_sec_filings: "QVeris SEC 公告",
  get_earnings_transcript: "QVeris 财报电话会记录",
  get_earnings_guidance: "QVeris 管理层业绩指引",
};

export function localizeGuidanceText(text: string | undefined, lang: Lang, fiscalYear?: number) {
  if (!text || lang === "en") return text;
  const quarter = text.match(/fiscal\s+(Q[1-4])/i)?.[1]?.toUpperCase();
  const revenue = metricMoney(text, /\b(?:revenue|sales)\b/i);
  const grossMargin = metricPercent(text, /\bgross margin\b/i);
  const operatingExpenses = metricMoney(text, /\boperating expenses?\b/i);
  const eps = metricMoney(text, /\bEPS\b|earnings per share/i);
  const metrics = [
    revenue && `营收 ${revenue}`,
    grossMargin && `毛利率约 ${grossMargin}`,
    operatingExpenses && `运营费用约 ${operatingExpenses}`,
    eps && `EPS ${eps}`,
  ].filter(Boolean);
  if (!metrics.length) return "公司已披露业绩指引，具体内容请查看引用来源。";
  const period = `${fiscalYear ? `${fiscalYear} 财年` : ""}${quarter ?? "下一季度"}`;
  return `${period}指引：${metrics.join("；")}。`;
}

export function localizeTranscript(transcript: TranscriptInsight | null | undefined, _lang: Lang) {
  return transcript;
}

export function localizeSources(sources: SourceRef[], lang: Lang) {
  if (lang === "en") return sources;
  return sources.map((source) => ({
    ...source,
    title: source.capability ? SOURCE_TITLES_ZH[source.capability] ?? source.title : source.title,
  }));
}

function metricMoney(text: string, label: RegExp) {
  const start = text.search(label);
  if (start < 0) return undefined;
  const snippet = text.slice(start, start + 180);
  const boundary = snippet.search(/;\s*|[.!?]\s+(?=[A-Z])/);
  const clause = boundary < 0 ? snippet : snippet.slice(0, boundary);
  const values = [...clause.matchAll(/\$([\d,.]+)\s*(billion|million|[BM])?/gi)];
  if (!values.length) return undefined;
  const midpoint = moneyToken(values[0]);
  const range = values[1] ? `（±${moneyToken(values[1])}）` : "";
  return `${midpoint}${range}`;
}

function metricPercent(text: string, label: RegExp) {
  const start = text.search(label);
  if (start < 0) return undefined;
  return text.slice(start, start + 100).match(/([\d.]+)%/)?.[0];
}

function moneyToken(match: RegExpMatchArray) {
  const unit = match[2]?.toLowerCase();
  const suffix = unit === "billion" || unit === "b" ? "B" : unit === "million" || unit === "m" ? "M" : "";
  return `$${match[1].replace(/[.,]+$/, "")}${suffix}`;
}
