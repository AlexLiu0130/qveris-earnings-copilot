import { NextResponse } from "next/server";
import { getAnalysisById } from "@/lib/earnings/analysisStore";
import { toAnalyzeResponse } from "@/lib/earnings/analyzeEarnings";

export async function GET(_req: Request, context: { params: Promise<{ analysisId: string }> }) {
  try {
    const { analysisId } = await context.params;
    const analysis = await getAnalysisById(decodeURIComponent(analysisId));
    if (!analysis) return NextResponse.json({ error: "ANALYSIS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({
      ...toAnalyzeResponse(analysis),
      cache: { hit: true, source: "stored_analysis" },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-QVeris-Analysis-Cache": "HIT",
      },
    });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
