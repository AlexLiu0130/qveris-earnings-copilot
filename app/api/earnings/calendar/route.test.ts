import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { GET } from "@/app/api/earnings/calendar/route";

test("calendar route returns no-store contract metadata", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { GET } from "./app/api/earnings/calendar/route.ts";
    const res = await GET(new Request("http://localhost/api/earnings/calendar?from=2099-02-01&to=2099-02-02&universe=NO_SUCH_SYMBOL"));
    console.log(JSON.stringify({ status: res.status, cacheControl: res.headers.get("Cache-Control"), body: await res.json() }));
  `], {
    cwd: process.cwd(),
    env: testEnv({ EARNINGS_PROVIDER: "mock", ALLOW_DEMO_DATA: "true" }),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const { status, cacheControl, body } = JSON.parse(child.stdout) as {
    status: number;
    cacheControl: string | null;
    body: {
      generatedAt?: string;
      sources?: unknown[];
      missing?: string[];
      capabilityStatus?: Record<string, string>;
      confidence?: { label?: string; reason?: string };
    };
  };
  assert.equal(status, 200);
  assert.equal(cacheControl, "no-store");
  assert.match(body.generatedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(body.sources, []);
  assert.deepEqual(body.missing, []);
  assert.deepEqual(body.capabilityStatus, { earningsCalendar: "available" });
  assert.equal(body.confidence?.label, "low");
  assert.match(body.confidence?.reason ?? "", /No source references/);
});

test("calendar route uses safe no-store error responses", async () => {
  const res = await GET(new Request("http://localhost/api/earnings/calendar?minMarketCap=-1"));
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await res.json(), { error: "INVALID_REQUEST", field: "minMarketCap" });
});

test("calendar route returns mock calendar events with audited demo sources", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { GET } from "./app/api/earnings/calendar/route.ts";
    const res = await GET(new Request("http://localhost/api/earnings/calendar?from=2026-07-21&to=2026-07-21&universe=NVDA"));
    console.log(JSON.stringify({ status: res.status, cacheControl: res.headers.get("Cache-Control"), body: await res.json() }));
  `], {
    cwd: process.cwd(),
    env: testEnv({ EARNINGS_PROVIDER: "mock", ALLOW_DEMO_DATA: "true" }),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const { status, cacheControl, body } = JSON.parse(child.stdout) as {
    status: number;
    cacheControl: string | null;
    body: {
      events?: unknown[];
      sources?: Array<{ id?: string }>;
      missing?: string[];
      issues?: Array<{ code?: string }>;
      capabilityStatus: { earningsCalendar: string };
      confidence: { label: string; reason: string };
    };
  };
  assert.equal(status, 200);
  assert.equal(cacheControl, "no-store");
  assert.equal(body.events?.length, 1);
  assert.equal(body.capabilityStatus.earningsCalendar, "available");
  assert.ok(body.sources?.some((source) => source.id === "NVDA-demo-calendar"));
  assert.doesNotMatch(JSON.stringify(body.missing ?? []), /SOURCE_REF_MISSING/);
  assert.ok(!body.issues?.some((issue) => issue.code === "SOURCE_REF_MISSING"));
  assert.equal(body.confidence.label, "medium");
  assert.match(body.confidence.reason, /source references|sources/i);
});

test("calendar route marks provider gaps unavailable with reason", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { GET } from "./app/api/earnings/calendar/route.ts";
    const res = await GET(new Request("http://localhost/api/earnings/calendar?from=2099-04-01&to=2099-04-02&universe=ROUTE_GAP_TEST"));
    console.log(JSON.stringify({ status: res.status, cacheControl: res.headers.get("Cache-Control"), body: await res.json() }));
  `], {
    cwd: process.cwd(),
    env: testEnv({ EARNINGS_PROVIDER: "qveris", QVERIS_API_KEY: "" }),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const { status, cacheControl, body } = JSON.parse(child.stdout) as {
    status: number;
    cacheControl: string | null;
    body: {
      missing?: string[];
      capabilityStatus?: { earningsCalendar?: string };
      confidence?: { label?: string; reason?: string };
    };
  };
  assert.equal(status, 200);
  assert.equal(cacheControl, "no-store");
  assert.equal(body.capabilityStatus?.earningsCalendar, "unavailable");
  assert.ok(body.missing?.includes("earningsCalendar"));
  assert.equal(body.confidence?.label, "low");
  assert.match(body.confidence?.reason ?? "", /EARNINGS_CALENDAR_UNAVAILABLE/);
});

test("calendar route hides unexpected errors", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { GET } from "./app/api/earnings/calendar/route.ts";
    const res = await GET(new Request("http://localhost/api/earnings/calendar?from=2099-05-01&to=2099-05-02"));
    console.log(JSON.stringify({ status: res.status, cacheControl: res.headers.get("Cache-Control"), body: await res.json() }));
  `], {
    cwd: process.cwd(),
    env: testEnv({ EARNINGS_PROVIDER: "bogus" }),
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const { status, cacheControl, body } = JSON.parse(child.stdout) as {
    status: number;
    cacheControl: string | null;
    body: unknown;
  };
  assert.equal(status, 500);
  assert.equal(cacheControl, "no-store");
  assert.deepEqual(body, { error: "INTERNAL_ERROR" });
});

function testEnv(vars: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...vars };
}
