import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketReaction } from "@/lib/earnings/marketReaction";

const bars = [
  { date: "2026-06-23", open: 1080, close: 1051.77, volume: 60, sourceIds: ["prices"] },
  { date: "2026-06-24", open: 1082.22, close: 1048.51, volume: 69, sourceIds: ["prices"] },
  { date: "2026-06-25", open: 1233, close: 1213.56, volume: 83, sourceIds: ["prices"] },
];

test("after-close earnings use the next regular trading session", () => {
  const reaction = buildMarketReaction({
    id: "MU-2026-06-24",
    ticker: "MU",
    reportDate: "2026-06-24",
    timing: "after_close",
    status: "reported",
    sourceIds: ["calendar"],
  }, bars);
  assert.equal(reaction?.baselineSessionDate, "2026-06-24");
  assert.equal(reaction?.reactionSessionDate, "2026-06-25");
  assert.equal(reaction?.basis, "next_session");
  assert.ok(Math.abs((reaction?.closeChangePct ?? 0) - 15.74) < 0.01);
});

test("before-open earnings use the report-date trading session", () => {
  const reaction = buildMarketReaction({
    id: "MU-2026-06-24",
    ticker: "MU",
    reportDate: "2026-06-24",
    timing: "before_open",
    status: "reported",
    sourceIds: ["calendar"],
  }, bars);
  assert.equal(reaction?.baselineSessionDate, "2026-06-23");
  assert.equal(reaction?.reactionSessionDate, "2026-06-24");
  assert.equal(reaction?.basis, "same_session");
});
