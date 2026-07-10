import assert from "node:assert/strict";
import test from "node:test";
import { detectEarningsMode } from "@/lib/earnings/detectEarningsMode";
import type { EarningsEvent } from "@/lib/earnings/types";

const base = {
  id: "event",
  ticker: "NVDA",
  timing: "after_close",
  sourceIds: ["demo"],
} satisfies Partial<EarningsEvent>;

test("recent reported plus upcoming resolves to combined", () => {
  const detected = detectEarningsMode([
    { ...base, id: "recent", reportDate: "2026-07-02", status: "reported" },
    { ...base, id: "upcoming", reportDate: "2026-07-22", status: "upcoming" },
  ] as EarningsEvent[], "2026-07-08");
  assert.equal(detected.mode, "combined");
  assert.equal(detected.recentEvent?.id, "recent");
  assert.equal(detected.upcomingEvent?.id, "upcoming");
});

test("no qualifying event resolves to no_event", () => {
  const detected = detectEarningsMode([
    { ...base, id: "old", reportDate: "2026-06-01", status: "reported" },
  ] as EarningsEvent[], "2026-07-08");
  assert.equal(detected.mode, "no_event");
});
