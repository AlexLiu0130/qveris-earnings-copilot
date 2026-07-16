import assert from "node:assert/strict";
import test from "node:test";
import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";
import { getEarningsCalendar } from "@/lib/earnings/calendar";

test("calendar returns provider source refs and reports missing audit refs without placeholders", async () => {
  const source = {
    id: "MU-qveris-get_earnings_calendar",
    title: "Provider calendar audit",
    provider: "QVeris",
    retrievedAt: "2099-01-01T00:00:00.000Z",
    capability: "get_earnings_calendar",
    executionId: "exec-1",
  };
  const provider = {
    async getEarningsCalendar() {
      return [{
        id: "MU-2099-02-01",
        ticker: "MU",
        reportDate: "2099-02-01",
        timing: "after_close" as const,
        status: "upcoming" as const,
        sourceIds: [source.id, "missing-calendar-source"],
      }];
    },
    getSourceRefs() {
      return [
        source,
        { ...source, id: "unused-source", executionId: "unused-exec" },
      ];
    },
  } as unknown as EarningsCapabilityProvider;

  const calendar = await getEarningsCalendar({ from: "2099-02-01", to: "2099-02-02" }, provider);

  assert.deepEqual(calendar.sources, [source]);
  assert.equal(calendar.issues[0]?.code, "SOURCE_REF_MISSING");
  assert.equal(calendar.issues[0]?.toolId, "missing-calendar-source");
  assert.deepEqual(calendar.missing, ["source:missing-calendar-source"]);
});

test("calendar does not cache provider failure but caches successful empty results", async () => {
  const oldProvider = process.env.EARNINGS_PROVIDER;
  const oldAllowDemoData = process.env.ALLOW_DEMO_DATA;
  const oldApiKey = process.env.QVERIS_API_KEY;
  const params = { from: "2099-02-01", to: "2099-02-02", universe: "NO_SUCH_SYMBOL" };

  try {
    process.env.EARNINGS_PROVIDER = "qveris";
    delete process.env.QVERIS_API_KEY;

    const failed = await getEarningsCalendar(params);
    assert.deepEqual(failed.events, []);
    assert.equal(failed.issues[0]?.code, "EARNINGS_CALENDAR_UNAVAILABLE");
    assert.equal(cachedFlag(failed), false);

    process.env.EARNINGS_PROVIDER = "mock";
    process.env.ALLOW_DEMO_DATA = "true";
    const empty = await getEarningsCalendar(params);
    assert.deepEqual(empty.events, []);
    assert.deepEqual(empty.issues, []);
    assert.equal(cachedFlag(empty), false);

    process.env.EARNINGS_PROVIDER = "qveris";
    const cachedEmpty = await getEarningsCalendar(params);
    assert.deepEqual(cachedEmpty.events, []);
    assert.deepEqual(cachedEmpty.issues, []);
    assert.equal(cachedFlag(cachedEmpty), true);
  } finally {
    if (oldProvider === undefined) delete process.env.EARNINGS_PROVIDER;
    else process.env.EARNINGS_PROVIDER = oldProvider;
    if (oldAllowDemoData === undefined) delete process.env.ALLOW_DEMO_DATA;
    else process.env.ALLOW_DEMO_DATA = oldAllowDemoData;
    if (oldApiKey === undefined) delete process.env.QVERIS_API_KEY;
    else process.env.QVERIS_API_KEY = oldApiKey;
  }
});

function cachedFlag(value: object) {
  return "cached" in value ? value.cached : undefined;
}
