import type { Lang } from "@/lib/i18n/dict";
import type { SourceRef, TranscriptInsight } from "@/lib/earnings/types";
import { aiApiKey, localEnv } from "@/lib/runtime/env";

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
  get_official_quarterly_results: "公司官方季度业绩",
};

export function localizeGuidanceText(text: string | undefined, lang: Lang, fiscalYear?: number) {
  if (!text || lang === "en") return text;
  const rangeGuidance = localizeRangeGuidance(text);
  if (rangeGuidance) return rangeGuidance;
  const quarter = text.match(/(?:fiscal\s+)?(Q[1-4])\b/i)?.[1]?.toUpperCase();
  const fullYear = text.match(/\bfull[- ]year\s+(20\d{2})\b/i)?.[1];
  const revenue = metricMoney(text, /\b(?:revenue|sales)\b/i);
  const revenueGrowth = revenueGrowthMetric(text);
  const grossMargin = metricPercent(text, /\bgross margin\b/i);
  const operatingExpenses = metricMoney(text, /\boperating expenses?\b/i);
  const contentExpenseGrowth = metricPercent(text, /\bcontent expense\b/i);
  const eps = metricMoney(text, /\bEPS\b|earnings per share/i);
  const niiExMarkets = firstMetricMoney(text, /\bNII ex[- ]Markets\b/i);
  const totalNii = firstMetricMoney(text, /\btotal NII\b/i);
  const marketsNii = firstMetricMoney(text, /\bmarkets NII\b/i);
  const nii = [
    niiExMarkets && `非市场 NII 约 ${niiExMarkets}`,
    totalNii && `总 NII 约 ${totalNii}`,
    marketsNii && `市场 NII 约 ${marketsNii}`,
  ].filter(Boolean);
  const adjustedExpense = firstMetricMoney(text, /\badjusted expense outlook\b/i);
  const metrics = [
    revenue && `营收 ${revenue}`,
    revenueGrowth,
    grossMargin && `毛利率约 ${grossMargin}`,
    operatingExpenses && `运营费用约 ${operatingExpenses}`,
    contentExpenseGrowth && `内容费用增长约 ${contentExpenseGrowth}`,
    eps && `EPS ${eps}`,
    ...nii,
    adjustedExpense && `调整后费用展望约 ${adjustedExpense}`,
  ].filter(Boolean);
  if (!metrics.length) return `业绩指引原文：${text}`;
  const period = fullYear
    ? `${fullYear} 全年`
    : `${fiscalYear ? `${fiscalYear} 财年` : ""}${quarter ?? "下一季度"}`;
  return `${period}指引：${metrics.join("；")}。`;
}

function localizeRangeGuidance(text: string) {
  const clauses = text.split(/(?<=\.)\s+/).flatMap((clause) => {
    const period = clause.match(/\b(Q[1-4])\s+(20\d{2})\b/i);
    const fullYear = clause.match(/\bfull[- ]year\s+(20\d{2})\b/i);
    const sales = clause.match(/\b(?:total net sales|revenue|sales)\b[^.]*?between\s*([€$])([\d.]+)\s*billion\s+and\s*[€$]?([\d.]+)\s*billion/i);
    const margin = clause.match(/\bgross margin\b[^.]*?between\s*([\d.]+)%\s+and\s+([\d.]+)%/i);
    const operatingMargin = clause.match(/\boperating margin\b[^.]*?between\s*([\d.]+)%\s+and\s+([\d.]+)%/i);
    if ((!period && !fullYear) || (!sales && !margin && !operatingMargin)) return [];
    const label = fullYear ? `${fullYear[1]} 全年` : `${period![2]} 财年${period![1].toUpperCase()}`;
    const metrics = [
      sales && `营收 ${sales[1]}${sales[2]}B–${sales[1]}${sales[3]}B`,
      margin && `毛利率 ${margin[1]}%–${margin[2]}%`,
      operatingMargin && `营业利润率 ${operatingMargin[1]}%–${operatingMargin[2]}%`,
    ].filter(Boolean);
    return `${label}指引：${metrics.join("；")}。`;
  });
  return clauses.length ? clauses.join("") : undefined;
}

export function localizeTranscript(transcript: TranscriptInsight | null | undefined, _lang: Lang) {
  return transcript;
}

export async function translateTranscript(transcript: TranscriptInsight | null | undefined, lang: Lang) {
  if (lang !== "zh" || !transcript?.available || !transcript.repeatedQuestions?.length) return transcript;
  const env = localEnv();
  const apiKey = aiApiKey(env);
  if (!apiKey) return transcript;
  try {
    const res = await fetch(`${(env.OPENAI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "deepseek-v4-flash",
        temperature: 0,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Translate the supplied earnings-call questions and answers faithfully into Simplified Chinese. Do not summarize, omit, explain, or add facts. Preserve company names, tickers, abbreviations, numbers, and every id. Return JSON with questions as objects {id,text} and answers as objects {id,topic,answer}." },
          { role: "user", content: JSON.stringify({ questions: transcript.repeatedQuestions.map((text, id) => ({ id, text })), answers: transcript.managementAnswers?.map(({ topic, answer }, id) => ({ id, topic, answer })) ?? [] }) },
        ],
      }),
    });
    if (!res.ok) return transcript;
    const payload = await res.json();
    const value = JSON.parse(payload?.choices?.[0]?.message?.content ?? "null") as { questions?: unknown; answers?: unknown } | null;
    const questions = translatedQuestions(value?.questions, transcript.repeatedQuestions.length);
    const answers = translatedAnswers(value?.answers, transcript.managementAnswers?.length ?? 0);
    if (!questions.some(Boolean) && !answers.some((item) => item.topic && item.answer)) return transcript;
    return {
      ...transcript,
      questionTranslations: questions,
      managementAnswers: transcript.managementAnswers?.map((item, index) => ({
        ...item,
        topicTranslation: answers[index]?.topic || undefined,
        answerTranslation: answers[index]?.answer || undefined,
      })),
    };
  } catch {
    return transcript;
  }
}

function translatedQuestions(value: unknown, expected: number) {
  const translations = Array<string>(expected).fill("");
  if (!Array.isArray(value)) return translations;
  for (const item of value) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const id = Number(record.id);
    if (Number.isInteger(id) && id >= 0 && id < expected) translations[id] = chinese(record.text);
  }
  return translations;
}

function translatedAnswers(value: unknown, expected: number) {
  const translations = Array.from({ length: expected }, () => ({ topic: "", answer: "" }));
  if (!Array.isArray(value)) return translations;
  for (const item of value) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const id = Number(record.id);
    if (Number.isInteger(id) && id >= 0 && id < expected) translations[id] = { topic: chinese(record.topic), answer: chinese(record.answer) };
  }
  return translations;
}

function chinese(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /[\u3400-\u9fff]/.test(text) ? text : "";
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

function firstMetricMoney(text: string, label: RegExp) {
  const start = text.search(label);
  if (start < 0) return undefined;
  const value = text.slice(start, start + 180).match(/\$([\d,.]+)\s*(billion|million|[BM])?/i);
  return value ? moneyToken(value) : undefined;
}

function metricPercent(text: string, label: RegExp) {
  const start = text.search(label);
  if (start < 0) return undefined;
  return text.slice(start, start + 100).match(/([\d.]+)%/)?.[0];
}

function revenueGrowthMetric(text: string) {
  const revenueGrowth = text.match(/(\d+(?:\.\d+)?)%\s+revenue growth\b/i)?.[1]
    ?? text.match(/\brevenue growth\b[^.!?]{0,50}?(\d+(?:\.\d+)?)%/i)?.[1];
  if (!revenueGrowth) return undefined;
  const reported = /\brevenue growth\b[^.!?]{0,80}\breported\b/i.test(text);
  const fxNeutral = text.match(/(\d+(?:\.\d+)?)%\s+FX[- ]neutral\b/i)?.[1];
  return `营收增长 ${revenueGrowth}%${reported ? "（报告口径）" : ""}${fxNeutral ? ` / ${fxNeutral}%（固定汇率口径）` : ""}`;
}

function moneyToken(match: RegExpMatchArray) {
  const unit = match[2]?.toLowerCase();
  const suffix = unit === "billion" || unit === "b" ? "B" : unit === "million" || unit === "m" ? "M" : "";
  return `$${match[1].replace(/[.,]+$/, "")}${suffix}`;
}
