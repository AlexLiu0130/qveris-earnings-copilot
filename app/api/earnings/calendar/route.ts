import { NextResponse } from "next/server";
import { getEarningsCalendar } from "@/lib/earnings/calendar";
import type { EarningsTiming } from "@/lib/earnings/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsedMinMarketCap = parseMinMarketCap(url.searchParams.get("minMarketCap"));
  if (parsedMinMarketCap === "invalid") {
    return NextResponse.json({ error: "INVALID_REQUEST", field: "minMarketCap" }, { status: 400 });
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
  return NextResponse.json(calendar);
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
