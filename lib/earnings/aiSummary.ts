import { localEnv } from "@/lib/runtime/env";
import type { EarningsAnalysis } from "@/lib/earnings/types";

interface AiSummary {
  summaryBullets?: string[];
  keyDrivers?: string[];
  riskSignals?: string[];
  qualityOfEarnings?: string[];
  watchNext?: string[];
}

export async function generateAiSummary(input: Pick<
  EarningsAnalysis,
  | "ticker"
  | "language"
  | "mode"
  | "company"
  | "event"
  | "estimates"
  | "results"
  | "quote"
  | "marketReaction"
  | "financials"
  | "segmentRevenue"
  | "historicalSummary"
  | "news"
  | "filings"
  | "transcript"
  | "beatMiss"
  | "missing"
  | "confidence"
>) {
  const env = localEnv();
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (env.OPENAI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = env.OPENAI_MODEL || "deepseek-v4-flash";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are QVeris Earnings Copilot. Produce source-aware earnings research, not investment advice. Use only the provided JSON. Do not invent numbers. If data is missing, say unavailable. Return compact JSON with arrays: summaryBullets, keyDrivers, riskSignals, qualityOfEarnings, watchNext. " +
              "Do not cite revenue beat rates when historicalSummary.revenueDataPoints is 0. Do not cite EPS beat rates when historicalSummary.epsDataPoints is 0. Do not infer next earnings dates when the event is null. Never describe a financial or segment row as current unless its fiscal year and quarter match the event. " +
              "Use marketReaction for earnings-day price reaction. quote is only the latest market snapshot and must not be described as the earnings reaction. " +
              (input.language === "zh" ? "Write every narrative field in Simplified Chinese while preserving tickers, metric abbreviations, and every numeric value." : "Write every narrative field in English."),
          },
          {
            role: "user",
            content: JSON.stringify(redactForPrompt(input)),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return normalize(JSON.parse(content) as AiSummary, input.language);
  } catch {
    return null;
  }
}

function redactForPrompt(input: Parameters<typeof generateAiSummary>[0]) {
  return {
    ticker: input.ticker,
    language: input.language,
    mode: input.mode,
    company: input.company,
    event: input.event,
    estimates: input.estimates,
    results: input.results,
    quote: input.quote,
    marketReaction: input.marketReaction,
    financials: input.financials.slice(0, 2),
    segmentRevenue: input.segmentRevenue.slice(0, 2),
    historicalSummary: input.historicalSummary,
    news: input.news.slice(0, 5).map(({ title, summary, publishedAt, provider }) => ({ title, summary, publishedAt, provider })),
    filings: input.filings.slice(0, 5).map(({ formType, filedAt, title, summary }) => ({ formType, filedAt, title, summary })),
    transcript: input.transcript ? {
      available: input.transcript.available,
      managementTone: input.transcript.managementTone,
      guidanceTone: input.transcript.guidanceTone,
      riskLanguage: input.transcript.riskLanguage,
      repeatedQuestions: input.transcript.repeatedQuestions,
      managementAnswers: input.transcript.managementAnswers,
    } : null,
    beatMiss: input.beatMiss,
    missing: input.missing,
    confidence: input.confidence,
  };
}

function normalize(value: AiSummary, language: EarningsAnalysis["language"]) {
  return {
    summaryBullets: clean(value.summaryBullets, 8, language),
    keyDrivers: clean(value.keyDrivers, 5, language),
    riskSignals: clean(value.riskSignals, 5, language),
    qualityOfEarnings: clean(value.qualityOfEarnings, 5, language),
    watchNext: clean(value.watchNext, 5, language),
  };
}

function clean(value: unknown, limit: number, language: EarningsAnalysis["language"]) {
  const items = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, limit)
    : [];
  return language === "zh" ? items.filter((item) => /[\u3400-\u9fff]/.test(item)) : items;
}
