import assert from "node:assert/strict";
import test from "node:test";
import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";
import { HybridEarningsCapabilityProvider } from "@/lib/capabilities/HybridEarningsCapabilityProvider";
import { MockEarningsCapabilityProvider } from "@/lib/capabilities/MockEarningsCapabilityProvider";
import { MOCK_TICKERS, mockSources } from "@/lib/capabilities/mockData";
import { QVerisCapabilityProvider } from "@/lib/capabilities/QVerisCapabilityProvider";
import { getEarningsProvider } from "@/lib/capabilities/provider";

test("unknown EARNINGS_PROVIDER is rejected instead of falling back to mock", () => {
  assert.throws(
    () => getEarningsProvider({ EARNINGS_PROVIDER: "bogus", ALLOW_DEMO_DATA: "true" }),
    /INVALID_EARNINGS_PROVIDER/,
  );
});

test("mock provider requires explicit mock mode and ALLOW_DEMO_DATA=true", () => {
  assert.throws(
    () => getEarningsProvider({ EARNINGS_PROVIDER: "mock", ALLOW_DEMO_DATA: "false" }),
    /MOCK_PROVIDER_NOT_ALLOWED/,
  );
  assert.ok(getEarningsProvider({ EARNINGS_PROVIDER: "mock", ALLOW_DEMO_DATA: "true" }) instanceof MockEarningsCapabilityProvider);
});

test("default provider remains QVeris even when demo data is allowed", () => {
  assert.ok(getEarningsProvider({ ALLOW_DEMO_DATA: "true" }) instanceof QVerisCapabilityProvider);
});

test("mock provider exposes source refs only for supported mock tickers", () => {
  const sources = new MockEarningsCapabilityProvider().getSourceRefs();

  assert.deepEqual(sources, MOCK_TICKERS.flatMap((ticker) => mockSources(ticker)));
  assert.equal(sources.some((source) => source.id.startsWith("NOPE-")), false);
});

test("hybrid exposes demo fallback source refs only when demo fallback is allowed", () => {
  const primarySource = { id: "MU-qveris-calendar", title: "QVeris calendar", provider: "QVeris", retrievedAt: "2099-01-01T00:00:00.000Z" };
  const primary = { getSourceRefs: () => [primarySource] } as unknown as EarningsCapabilityProvider;
  const fallback = new MockEarningsCapabilityProvider();

  assert.deepEqual(new HybridEarningsCapabilityProvider({ primary, fallback, allowDemoFallback: false }).getSourceRefs(), [primarySource]);
  assert.ok(new HybridEarningsCapabilityProvider({ primary, fallback, allowDemoFallback: true }).getSourceRefs().some((source) => source.id === "NVDA-demo-calendar"));
});

test("hybrid exposes financial statements and revenue segments", async () => {
  const primary = {
    getFinancialStatements: async () => [],
    getRevenueSegments: async () => [{ date: "2099-09-30", period: "Q3", segments: [{ name: "AI", revenue: 100 }], sourceIds: ["segments"] }],
  } as unknown as EarningsCapabilityProvider;
  const fallback = {
    getFinancialStatements: async () => [{ date: "2099-09-30", period: "Q3", revenue: 100, sourceIds: ["financials"] }],
    getRevenueSegments: async () => [],
  } as unknown as EarningsCapabilityProvider;
  const provider = new HybridEarningsCapabilityProvider({ primary, fallback, allowDemoFallback: true });

  assert.deepEqual(await provider.getFinancialStatements("MU"), [{ date: "2099-09-30", period: "Q3", revenue: 100, sourceIds: ["financials"] }]);
  assert.deepEqual(await provider.getRevenueSegments("MU"), [{ date: "2099-09-30", period: "Q3", segments: [{ name: "AI", revenue: 100 }], sourceIds: ["segments"] }]);
});
