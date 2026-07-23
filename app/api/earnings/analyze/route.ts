import { NextResponse } from "next/server";
import { analyzeEarnings, toAnalyzeResponse } from "@/lib/earnings/analyzeEarnings";
import { getCachedAnalysis, saveAnalysis } from "@/lib/earnings/analysisStore";
import { isQVerisCapabilityError, providerUnavailableError } from "@/lib/earnings/providerIssues";
import { validateAnalyzeRequest } from "@/lib/earnings/validateRequest";

export async function POST(req: Request) {
  try {
    const body = validateAnalyzeRequest(await req.json());
    const cached = await getCachedAnalysis(body);
    const analysis = cached ?? await analyzeEarnings(body);
    if (!cached) await saveAnalysis(body, analysis);
    return NextResponse.json({
      ...toAnalyzeResponse(analysis),
      cache: {
        hit: Boolean(cached),
        reusable: !hasRetryableDataIssue(analysis),
        degraded: hasTransientInterpretationFailure(analysis),
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "X-QVeris-Analysis-Cache": cached ? "HIT" : "MISS",
      },
    });
  } catch (error) {
    if (isQVerisCapabilityError(error)) {
      return NextResponse.json(providerUnavailableError(error), { status: 502 });
    }
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "EARNINGS_DATA_UNAVAILABLE") {
      return NextResponse.json(
        { error: "EARNINGS_DATA_UNAVAILABLE" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (message === "INVALID_TICKER" || message === "INVALID_REQUEST") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message === "TICKER_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
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
      includeAiInterpretation: url.searchParams.get("includeAiInterpretation") !== "false",
    }),
  }));
}

function hasRetryableDataIssue(analysis: {
  issues?: Array<{ retryable?: boolean }>;
}) {
  return analysis.issues?.some((issue) => issue.retryable) ?? false;
}

function hasTransientInterpretationFailure(analysis: {
  interpretation?: { status: "available" | "unavailable"; reason?: string };
}) {
  return analysis.interpretation?.status === "unavailable"
    && analysis.interpretation.reason !== "AI_INTERPRETATION_DISABLED";
}
