import { NextResponse } from "next/server";
import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";
import { getAnalysisById, saveAnalysis } from "@/lib/earnings/analysisStore";
import { isQVerisCapabilityError, providerUnavailableError } from "@/lib/earnings/providerIssues";
import { validateTicker } from "@/lib/earnings/validateRequest";
import { buildShareImageSvg } from "@/lib/share/shareImage";
import type { EarningsAnalysis } from "@/lib/earnings/types";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker");
    const analysisId = url.searchParams.get("analysisId");
    const lang = url.searchParams.get("language") === "zh" ? "zh" : "en";
    const stored = analysisId ? await getAnalysisById(analysisId) : null;
    if (analysisId && !stored) return NextResponse.json({ error: "ANALYSIS_NOT_FOUND" }, { status: 404 });
    let analysis = stored;
    if (!analysis) {
      const requestTicker = ticker == null ? null : validateTicker(ticker);
      if (!requestTicker) return NextResponse.json({ error: "INVALID_TICKER" }, { status: 400 });
      const analysisRequest = { ticker: requestTicker, mode: "auto", language: lang, includeTranscript: true, includeAiSummary: false } as const;
      analysis = await analyzeEarnings(analysisRequest);
      await saveAnalysis(analysisRequest, analysis);
    }

    return new NextResponse(buildShareImageSvg(wrapForSvg(analysis)), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-QVeris-Analysis-Cache": stored ? "HIT" : "MISS",
      },
    });
  } catch (error) {
    if (isQVerisCapabilityError(error)) {
      return NextResponse.json(providerUnavailableError(error), { status: 502 });
    }
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "INVALID_TICKER") return NextResponse.json({ error: message }, { status: 400 });
    if (message === "TICKER_NOT_FOUND" || message === "ANALYSIS_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function wrapForSvg(analysis: EarningsAnalysis): EarningsAnalysis {
  return {
    ...analysis,
    company: analysis.company ? { ...analysis.company, name: spaced(analysis.company.name) } : analysis.company,
    results: analysis.results?.guidanceText
      ? { ...analysis.results, guidanceText: spaced(analysis.results.guidanceText) }
      : analysis.results,
    summaryBullets: analysis.summaryBullets.map(spaced),
    keyDrivers: analysis.keyDrivers.map(spaced),
    oneLineVerdict: spaced(analysis.oneLineVerdict),
  };
}

function spaced(value: string) {
  return value.replace(/\S{32,}/g, (word) => word.match(/.{1,24}/g)?.join(" ") ?? word);
}
