import { NextResponse } from "next/server";
import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";
import { getAnalysisById, saveAnalysis } from "@/lib/earnings/analysisStore";
import { buildShareCard, buildShareMarkdown } from "@/lib/share/shareCard";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { ticker?: string; analysisId?: string; format?: "link" | "markdown" | "image" };
    if (!body.ticker && !body.analysisId) return NextResponse.json({ error: "INVALID_TICKER" }, { status: 400 });
    const analysis = body.analysisId ? getAnalysisById(body.analysisId) : null;
    if (body.analysisId && !analysis && !body.ticker) {
      return NextResponse.json({ error: "ANALYSIS_NOT_FOUND" }, { status: 404 });
    }
    const resolved = analysis ?? await analyzeEarnings({ ticker: body.ticker ?? "NVDA", mode: "auto", includeTranscript: true });
    saveAnalysis({ ticker: resolved.ticker, mode: resolved.mode, includeTranscript: true }, resolved);
    const ticker = resolved.ticker;
    const analysisId = body.analysisId ?? resolved.analysisId;
    const imageUrl = `/api/earnings/share-card/image?analysisId=${encodeURIComponent(analysisId)}&ticker=${encodeURIComponent(ticker)}&language=${resolved.language}`;
    return NextResponse.json({
      shareUrl: `/earnings/${ticker}/share?analysisId=${encodeURIComponent(analysisId)}`,
      imageUrl,
      markdown: buildShareMarkdown(resolved),
      card: buildShareCard(resolved),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "INVALID_TICKER" ? 400 : message === "TICKER_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
