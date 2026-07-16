import { NextResponse } from "next/server";
import { getEarningsCalendar } from "@/lib/earnings/calendar";
import { isQVerisCapabilityError, providerUnavailableError } from "@/lib/earnings/providerIssues";
import type { EarningsTiming } from "@/lib/earnings/types";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsedMinMarketCap = parseMinMarketCap(url.searchParams.get("minMarketCap"));
    if (parsedMinMarketCap === "invalid") {
      return json({ error: "INVALID_REQUEST", field: "minMarketCap" }, 400);
    }
    const calendar = await getEarningsCalendar({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      universe: url.searchParams.get("universe") ?? undefined,
      sector: url.searchParams.get("sector") ?? undefined,
      status: statusParam(url.searchParams.get("status")),
      timing: timingParam(url.searchParams.get("timing")),
      minMarketCap: parsedMinMarketCap,
    });
    return json(withCalendarContract(calendar));
  } catch (error) {
    if (isQVerisCapabilityError(error)) return json(providerUnavailableError(error), 502);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}

function parseMinMarketCap(value: string | null): number | undefined | "invalid" {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}

function statusParam(value: string | null) {
  return value === "upcoming" || value === "reported" || value === "unknown" ? value : undefined;
}

function timingParam(value: string | null): EarningsTiming | undefined {
  return value === "before_open" || value === "after_close" || value === "during_market" || value === "unknown" ? value : undefined;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function withCalendarContract<T extends { issues: Array<{ capability?: string; code?: string }>; sources: unknown[] }>(calendar: T) {
  const calendarIssue = calendar.issues.find((issue) => issue.capability === "earningsCalendar");
  const sourceAuditIssue = calendar.issues.find((issue) => issue.capability === "sourceAudit");
  return {
    ...calendar,
    generatedAt: new Date().toISOString(),
    capabilityStatus: { earningsCalendar: calendarIssue ? "unavailable" : "available" },
    confidence: calendarIssue
      ? { label: "low", reason: `Earnings calendar unavailable: ${calendarIssue.code ?? "UNKNOWN_REASON"}.` }
      : sourceAuditIssue
        ? { label: "low", reason: `Calendar events returned with missing source references: ${sourceAuditIssue.code ?? "UNKNOWN_REASON"}.` }
      : calendar.sources.length
        ? { label: "medium", reason: "Calendar events include source references from connected sources." }
        : { label: "low", reason: "No source references were returned for this calendar response." },
  };
}
