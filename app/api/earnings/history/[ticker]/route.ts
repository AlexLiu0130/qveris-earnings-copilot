import { NextResponse } from "next/server";
import { listAnalysesByTicker } from "@/lib/earnings/analysisStore";
import { buildQuarterComparison, type QuarterComparisonRow } from "@/lib/earnings/quarterComparison";
import type { CapabilityState, ConfidenceLabel, EarningsAnalysis, SourceRef } from "@/lib/earnings/types";

export async function GET(req: Request, context: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: rawTicker } = await context.params;
    const ticker = decodeURIComponent(rawTicker).trim().toUpperCase().replace(/^\$/, "");
    const limit = parseLimit(new URL(req.url).searchParams.get("limit"));
    if (!ticker || limit == null) return json({ error: "INVALID_REQUEST" }, 400, "MISS");

    const analyses = await listAnalysesByTicker(ticker, limit);
    const quarters = buildQuarterComparison(analyses, limit);
    const audit = auditHistory(analyses, quarters, limit);

    return json({
      ticker,
      quarters,
      limitedHistory: audit.limitedHistory,
      generatedAt: analyses[0]?.generatedAt ?? new Date().toISOString(),
      cache: { hit: analyses.length > 0, source: "stored_analysis" },
      sources: audit.sources,
      missing: audit.missing,
      capabilityStatus: audit.capabilityStatus,
      confidence: audit.confidence,
    }, 200, analyses.length > 0 ? "HIT" : "MISS");
  } catch {
    return json({ error: "INTERNAL_ERROR" }, 500, "MISS");
  }
}

function parseLimit(value: string | null) {
  if (value == null || value === "") return 8;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function json(body: unknown, status: number, cache: "HIT" | "MISS") {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-QVeris-History-Cache": cache,
    },
  });
}

function auditHistory(analyses: EarningsAnalysis[], quarters: QuarterComparisonRow[], limit: number) {
  const usedSourceIds = usedQuarterSourceIds(quarters);
  const sourceMap = new Map<string, SourceRef>();
  for (const analysis of analyses) {
    for (const source of analysis.sources) {
      if (usedSourceIds.has(source.id) && !sourceMap.has(source.id)) sourceMap.set(source.id, source);
    }
  }

  const missing = [];
  const missingSourceIds = [...usedSourceIds].filter((id) => !sourceMap.has(id));
  const limitedHistory = quarters.length < limit;
  if (limitedHistory) missing.push("historicalSnapshots:insufficient");
  missing.push(...missingSourceIds.map((id) => `source:${id}`));

  const historicalSnapshots = analyses.length === 0
    ? "unavailable"
    : limitedHistory
      ? "partial"
      : "available";
  const sourceRefs = missingSourceIds.length > 0
    ? "partial"
    : usedSourceIds.size > 0
      ? "available"
      : "unavailable";
  const capabilityStatus = { historicalSnapshots, sourceRefs } satisfies Record<string, CapabilityState>;

  return {
    limitedHistory,
    sources: [...sourceMap.values()],
    missing,
    capabilityStatus,
    confidence: confidenceFor(historicalSnapshots, missingSourceIds.length > 0),
  };
}

function usedQuarterSourceIds(quarters: QuarterComparisonRow[]) {
  const ids = new Set<string>();
  for (const quarter of quarters) {
    for (const id of quarter.sourceIds) ids.add(id);
    for (const id of Object.values(quarter.fieldSourceIds).flat()) ids.add(id);
  }
  return ids;
}

function confidenceFor(historicalSnapshots: CapabilityState, hasMissingSources: boolean) {
  if (historicalSnapshots === "unavailable") {
    return {
      label: "low" as ConfidenceLabel,
      reason: "No stored historical snapshots were found for this ticker.",
    };
  }
  if (hasMissingSources) {
    return {
      label: "low" as ConfidenceLabel,
      reason: "History is available, but one or more referenced source records are missing.",
    };
  }
  if (historicalSnapshots === "partial") {
    return {
      label: "medium" as ConfidenceLabel,
      reason: "Stored history is available but does not cover the requested limit.",
    };
  }
  return {
    label: "high" as ConfidenceLabel,
    reason: "Stored history and referenced source records cover the requested limit.",
  };
}
