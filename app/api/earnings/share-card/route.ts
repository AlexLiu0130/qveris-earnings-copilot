import { NextResponse } from "next/server";
import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";
import { getAnalysisById, saveAnalysis } from "@/lib/earnings/analysisStore";
import { isQVerisCapabilityError, providerUnavailableError } from "@/lib/earnings/providerIssues";
import { validateTicker } from "@/lib/earnings/validateRequest";
import { buildShareCard, buildShareMarkdown } from "@/lib/share/shareCard";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { ticker?: unknown; analysisId?: unknown; format?: "link" | "markdown" | "image" };
    const analysisIdInput = typeof body.analysisId === "string" && body.analysisId ? body.analysisId : null;
    const analysis = analysisIdInput ? await getAnalysisById(analysisIdInput) : null;
    if (analysisIdInput && !analysis) {
      return NextResponse.json({ error: "ANALYSIS_NOT_FOUND" }, { status: 404 });
    }
    const requestTicker = body.ticker == null ? null : validateTicker(body.ticker);
    if (!analysis && !requestTicker) return NextResponse.json({ error: "INVALID_TICKER" }, { status: 400 });
    const resolved = analysis ?? await analyzeEarnings({ ticker: requestTicker!, mode: "auto", includeTranscript: true });
    if (!analysis) await saveAnalysis({ ticker: resolved.ticker, mode: resolved.mode, includeTranscript: true }, resolved);
    const ticker = resolved.ticker;
    const analysisId = analysisIdInput ?? resolved.analysisId;
    const imageUrl = `/api/earnings/share-card/image?analysisId=${encodeURIComponent(analysisId)}&ticker=${encodeURIComponent(ticker)}&language=${resolved.language}`;
    return NextResponse.json({
      shareUrl: `/earnings/${ticker}/share?analysisId=${encodeURIComponent(analysisId)}`,
      imageUrl,
      markdown: buildShareMarkdown(resolved),
      card: buildShareCard(resolved),
      generatedAt: resolved.generatedAt,
      sources: resolved.sources,
      missing: resolved.missing,
      capabilityStatus: resolved.capabilityStatus,
      confidence: resolved.confidence,
      cache: { hit: Boolean(analysis), source: analysis ? "stored_analysis" : "fresh_analysis" },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-QVeris-Analysis-Cache": analysis ? "HIT" : "MISS",
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
