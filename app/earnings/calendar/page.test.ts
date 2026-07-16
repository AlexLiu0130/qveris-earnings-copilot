import assert from "node:assert/strict";
import test from "node:test";
import { parseMinMarketCapBillions } from "@/app/earnings/calendar/marketCapFilter";

test("calendar market cap filter parses billions into absolute dollars", () => {
  assert.equal(parseMinMarketCapBillions("50"), 50_000_000_000);
  assert.equal(parseMinMarketCapBillions("0"), 0);
});

test("calendar market cap filter ignores invalid values", () => {
  assert.equal(parseMinMarketCapBillions(undefined), undefined);
  assert.equal(parseMinMarketCapBillions(""), undefined);
  assert.equal(parseMinMarketCapBillions("-1"), undefined);
  assert.equal(parseMinMarketCapBillions("abc"), undefined);
});
