import { localEnv } from "@/lib/runtime/env";
import type { ClaimSourceIds, EarningsAnalysis } from "@/lib/earnings/types";

interface AiSummary {
  summaryBullets?: AiClaim[];
  keyDrivers?: AiClaim[];
  riskSignals?: AiClaim[];
  qualityOfEarnings?: AiClaim[];
  watchNext?: AiClaim[];
}

type AiClaim = string | { text?: unknown; sourceIds?: unknown };
type AiSection = "summaryBullets" | "keyDrivers" | "riskSignals" | "qualityOfEarnings" | "watchNext";

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
  | "sources"
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
              "You are QVeris Earnings Copilot. Produce source-aware earnings research, not investment advice. Use only the provided JSON. Do not invent numbers. If data is missing, say unavailable. Return compact JSON with arrays: summaryBullets, keyDrivers, riskSignals, qualityOfEarnings, watchNext. Every array item must be an object with text and sourceIds. sourceIds must be copied from provided sources. " +
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
    sources: input.sources.map(({ id, title, provider, capability }) => ({ id, title, provider, capability })),
  };
}

function normalize(value: AiSummary, language: EarningsAnalysis["language"]) {
  const summaryBullets = clean(value.summaryBullets, 8, language);
  const keyDrivers = clean(value.keyDrivers, 5, language);
  const riskSignals = clean(value.riskSignals, 5, language);
  const qualityOfEarnings = clean(value.qualityOfEarnings, 5, language);
  const watchNext = clean(value.watchNext, 5, language);
  return {
    summaryBullets: summaryBullets.items,
    keyDrivers: keyDrivers.items,
    riskSignals: riskSignals.items,
    qualityOfEarnings: qualityOfEarnings.items,
    watchNext: watchNext.items,
    claimSourceIds: {
      summaryBullets: summaryBullets.sourceIds,
      keyDrivers: keyDrivers.sourceIds,
      riskSignals: riskSignals.sourceIds,
      qualityOfEarnings: qualityOfEarnings.sourceIds,
      watchNext: watchNext.sourceIds,
    } satisfies Record<AiSection, ClaimSourceIds[]>,
  };
}

function clean(value: unknown, limit: number, language: EarningsAnalysis["language"]) {
  const claims = Array.isArray(value) ? value.flatMap(parseClaim) : [];
  const filtered = (language === "zh" ? claims.filter((claim) => /[\u3400-\u9fff]/.test(claim.text)) : claims).slice(0, limit);
  return {
    items: filtered.map((claim) => claim.text),
    sourceIds: filtered.map((claim) => claim.sourceIds),
  };
}

function parseClaim(item: AiClaim) {
  const text = typeof item === "string" ? item.trim() : typeof item.text === "string" ? item.text.trim() : "";
  if (!text) return [];
  const sourceIds = typeof item === "object" && Array.isArray(item.sourceIds)
    ? item.sourceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
    : "unavailable";
  return [{ text, sourceIds: Array.isArray(sourceIds) && sourceIds.length ? sourceIds : "unavailable" as ClaimSourceIds }];
}
