import assert from "node:assert/strict";
import test from "node:test";
import { buildEventStatus, buildWhatChanged, oneLineVerdict } from "@/lib/earnings/eventWorkspace";

test("event workspace exposes status and deltas without inventing missing data", () => {
  const input = {
    event: { id: "MU-2026-06-24", ticker: "MU", reportDate: "2026-06-24", timing: "after_close" as const, status: "reported" as const, sourceIds: ["calendar"] },
    results: { ticker: "MU", revenueActual: 10, epsActual: 2, sourceIds: ["results"] },
    filings: [],
    transcript: { available: false, sourceIds: [] },
    summaryBullets: ["MU reported above available EPS context."],
    historicalPattern: [{ eventId: "prev", reportDate: "2026-03-20", revenueActual: 8, epsActual: 3, sourceIds: ["history"] }],
  };

  assert.equal(buildEventStatus(input)[0].state, "available");
  assert.equal(buildEventStatus(input)[3].state, "unavailable");
  assert.equal(buildWhatChanged(input)[0].direction, "up");
  assert.equal(buildWhatChanged(input)[1].direction, "down");
  assert.equal(oneLineVerdict(input.summaryBullets, input.event), input.summaryBullets[0]);
});

test("event workspace marks source audit conflicts", () => {
  const status = buildEventStatus({
    event: null,
    results: null,
    filings: [],
    transcript: null,
    summaryBullets: ["Analysis generated."],
    historicalPattern: [],
    sources: [{ id: "source", title: "Source", retrievedAt: "2026-07-10T00:00:00Z" }],
    conflicts: ["Values differ."],
  });
  assert.equal(status.find((step) => step.key === "sourceAudit")?.state, "conflict");
});
