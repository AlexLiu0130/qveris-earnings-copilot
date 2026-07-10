import { daysBetween, todayIso } from "@/lib/earnings/date";
import type { EarningsEvent, ResolvedAnalysisMode } from "@/lib/earnings/types";

export interface DetectedEvents {
  mode: ResolvedAnalysisMode;
  event: EarningsEvent | null;
  upcomingEvent: EarningsEvent | null;
  recentEvent: EarningsEvent | null;
}

export function detectEarningsMode(events: EarningsEvent[], today = todayIso()): DetectedEvents {
  const upcoming = events
    .filter((event) => event.status === "upcoming")
    .filter((event) => {
      const days = daysBetween(today, event.reportDate);
      return days >= 0 && days <= 45;
    })
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))[0] ?? null;

  const recent = events
    .filter((event) => event.status === "reported")
    .filter((event) => {
      const days = daysBetween(event.reportDate, today);
      return days >= 0 && days <= 30;
    })
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0] ?? null;

  if (recent && upcoming) {
    return { mode: "combined", event: recent, recentEvent: recent, upcomingEvent: upcoming };
  }
  if (recent) return { mode: "flash", event: recent, recentEvent: recent, upcomingEvent: null };
  if (upcoming) return { mode: "preview", event: upcoming, recentEvent: null, upcomingEvent: upcoming };
  return { mode: "no_event", event: null, recentEvent: null, upcomingEvent: null };
}
