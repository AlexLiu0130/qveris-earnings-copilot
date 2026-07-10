import { NextResponse } from "next/server";
import { analyzeEarnings, toAnalyzeResponse } from "@/lib/earnings/analyzeEarnings";
import { getCachedAnalysis, saveAnalysis } from "@/lib/earnings/analysisStore";
import { validateAnalyzeRequest } from "@/lib/earnings/validateRequest";

export async function POST(req: Request) {
  try {
    const body = validateAnalyzeRequest(await req.json());
    const analysis = getCachedAnalysis(body) ?? await analyzeEarnings(body);
    saveAnalysis(body, analysis);
    return NextResponse.json(toAnalyzeResponse(analysis));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "INVALID_TICKER" || message === "INVALID_REQUEST" ? 400 : message === "TICKER_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return POST(new Request(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: url.searchParams.get("ticker") ?? "",
      mode: url.searchParams.get("mode") ?? "auto",
      language: url.searchParams.get("language") ?? "en",
      includeTranscript: url.searchParams.get("includeTranscript") !== "false",
    }),
  }));
}
