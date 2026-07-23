import assert from "node:assert/strict";
import test from "node:test";
import { fmtEps, fmtMoney } from "@/lib/formatting/format";

test("financial values use the supplied currency", () => {
  assert.equal(fmtMoney(9_326_500_000, "EUR"), "€9.33B");
  assert.equal(fmtEps(7.59, "EUR"), "€7.59");
});
