import assert from "node:assert/strict";
import test from "node:test";
import { classifyGuidance, computeEpsBeatMiss, computeRevenueBeatMiss } from "@/lib/earnings/computeBeatMiss";

test("revenue beat/miss uses rounding tolerance", () => {
  assert.equal(computeRevenueBeatMiss(100.1, 100), "inline");
  assert.equal(computeRevenueBeatMiss(100.3, 100), "beat");
  assert.equal(computeRevenueBeatMiss(99.7, 100), "miss");
  assert.equal(computeRevenueBeatMiss(undefined, 100), "unavailable");
});

test("eps beat/miss uses direct comparison", () => {
  assert.equal(computeEpsBeatMiss(1.01, 1), "beat");
  assert.equal(computeEpsBeatMiss(0.99, 1), "miss");
  assert.equal(computeEpsBeatMiss(1, 1), "inline");
  assert.equal(computeEpsBeatMiss(1, undefined), "unavailable");
});

test("numeric guidance is disclosed without inventing a directional change", () => {
  assert.equal(classifyGuidance("Revenue is expected to be $50 billion, plus or minus $1 billion."), "provided");
  assert.equal(classifyGuidance("Management raised revenue guidance."), "raised");
});
