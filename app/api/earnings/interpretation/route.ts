import { NextResponse } from "next/server";
import { buildAnalysisId } from "@/lib/earnings/analysisId";
import { getAnalysisById, listAnalysesByTicker, saveAnalysis } from "@/lib/earnings/analysisStore";
import { generateAiInterpretation } from "@/lib/earnings/aiInterpretation";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { analysisId?: unknown };
    if (typeof body.analysisId !== "string" || body.analysisId.length < 8 || body.analysisId.length > 160) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const base = await getAnalysisById(body.analysisId);
    if (!base) return NextResponse.json({ error: "ANALYSIS_NOT_FOUND" }, { status: 404 });

    const existing = (await listAnalysesByTicker(base.ticker, 20)).find((candidate) =>
      candidate.interpretation?.agent?.contractVersion === "earnings_research_agent_v1"
      && candidate.interpretation.agent.baseAnalysisId === body.analysisId
    );
    if (existing?.interpretation) {
      return NextResponse.json({
        analysisId: existing.analysisId,
        interpretation: existing.interpretation,
        sources: existing.sources,
        cache: { hit: true },
      }, { headers: { "Cache-Control": "no-store", "X-QVeris-Agent-Cache": "HIT" } });
    }

    const generated = await generateAiInterpretation(base);
    const interpretation = generated.agent
      ? { ...generated, agent: { ...generated.agent, baseAnalysisId: body.analysisId } }
      : generated;
    const generatedAt = new Date().toISOString();
    const analysis = {
      ...base,
      analysisId: buildAnalysisId({ ticker: base.ticker, mode: base.mode, generatedAt }),
      generatedAt,
      interpretation,
    };
    await saveAnalysis({
      ticker: base.ticker,
      mode: base.mode,
      language: base.language,
      includeSources: true,
      includeHistoricalPattern: true,
      includeNews: true,
      includeFilings: true,
      includeTranscript: true,
      includeAiSummary: false,
      includeAiInterpretation: true,
    }, analysis);

    return NextResponse.json({
      analysisId: analysis.analysisId,
      interpretation,
      sources: analysis.sources,
      cache: { hit: false },
    }, { headers: { "Cache-Control": "no-store", "X-QVeris-Agent-Cache": "MISS" } });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
