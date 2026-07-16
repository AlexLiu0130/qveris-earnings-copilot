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

test("recent reported window includes exactly 30 days", () => {
  const detected = detectEarningsMode([
    { ...base, id: "day-30", reportDate: "2026-06-08", status: "reported" },
  ] as EarningsEvent[], "2026-07-08");
  assert.equal(detected.mode, "flash");
  assert.equal(detected.recentEvent?.id, "day-30");
});

test("recent reported window excludes 31 days", () => {
  const detected = detectEarningsMode([
    { ...base, id: "day-31", reportDate: "2026-06-07", status: "reported" },
  ] as EarningsEvent[], "2026-07-08");
  assert.equal(detected.mode, "no_event");
});

test("reported earnings 16 days ago still resolves to flash", () => {
  const detected = detectEarningsMode([
    { ...base, id: "day-16", reportDate: "2026-06-24", status: "reported" },
  ] as EarningsEvent[], "2026-07-10");
  assert.equal(detected.mode, "flash");
  assert.equal(detected.recentEvent?.id, "day-16");
});

test("reported earnings 22 days ago still resolves to flash", () => {
  const detected = detectEarningsMode([
    { ...base, id: "day-22", reportDate: "2026-06-24", status: "reported" },
  ] as EarningsEvent[], "2026-07-16");
  assert.equal(detected.mode, "flash");
  assert.equal(detected.recentEvent?.id, "day-22");
});

test("no qualifying event resolves to no_event", () => {
  const detected = detectEarningsMode([
    { ...base, id: "old", reportDate: "2026-06-01", status: "reported" },
  ] as EarningsEvent[], "2026-07-08");
  assert.equal(detected.mode, "no_event");
});
