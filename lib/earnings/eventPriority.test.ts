import assert from "node:assert/strict";
import test from "node:test";
import { compareMarketCapDesc } from "@/lib/earnings/eventPriority";
import type { EarningsEvent } from "@/lib/earnings/types";

const event = (ticker: string): EarningsEvent => ({
  id: ticker,
  ticker,
  reportDate: "2026-07-24",
  timing: "unknown",
  status: "upcoming",
  sourceIds: [],
});

test("market cap priority puts known larger companies first and unknown values last", () => {
  const marketCaps = new Map([
    ["LARGE", 1_000],
    ["SMALL", 10],
  ]);
  const sorted = [event("UNKNOWN"), event("SMALL"), event("LARGE")]
    .sort((a, b) => compareMarketCapDesc(a, b, marketCaps));
  assert.deepEqual(sorted.map(({ ticker }) => ticker), ["LARGE", "SMALL", "UNKNOWN"]);
});
