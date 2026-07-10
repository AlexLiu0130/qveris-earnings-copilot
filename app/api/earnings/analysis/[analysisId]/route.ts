import { NextResponse } from "next/server";
import { getAnalysisById } from "@/lib/earnings/analysisStore";
import { toAnalyzeResponse } from "@/lib/earnings/analyzeEarnings";

export async function GET(_req: Request, context: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await context.params;
  const analysis = getAnalysisById(decodeURIComponent(analysisId));
  if (!analysis) return NextResponse.json({ error: "ANALYSIS_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(toAnalyzeResponse(analysis));
}
