import { NextResponse } from "next/server";
import { analyzeEarnings } from "@/lib/earnings/analyzeEarnings";
import { getAnalysisById } from "@/lib/earnings/analysisStore";
import { buildShareImageSvg } from "@/lib/share/shareImage";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker");
  const analysisId = url.searchParams.get("analysisId");
  const lang = url.searchParams.get("language") === "zh" ? "zh" : "en";
  const stored = analysisId ? getAnalysisById(analysisId) : null;
  if (!stored && !ticker) return NextResponse.json({ error: "INVALID_TICKER" }, { status: 400 });

  const analysis = stored ?? await analyzeEarnings({
    ticker: ticker ?? "NVDA",
    mode: "auto",
    language: lang,
    includeTranscript: true,
    includeAiSummary: false,
  });

  return new NextResponse(buildShareImageSvg(analysis), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
