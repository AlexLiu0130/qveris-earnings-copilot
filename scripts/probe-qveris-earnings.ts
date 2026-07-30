import { QVERIS_EARNINGS_TOOL_IDS as tools } from "../lib/capabilities/qverisEarningsTools";

const apiKey = process.env.QVERIS_API_KEY?.trim();
const baseUrl = (process.env.QVERIS_BASE_URL || "https://qveris.ai/api/v1").replace(/\/+$/, "");
if (!apiKey) throw new Error("QVERIS_API_KEY is required");

type Probe = {
  name: string;
  toolId: string;
  parameters: Record<string, unknown>;
  validate: (data: unknown) => boolean;
};

const symbols = ["MU", "GOOGL", "JPM", "TSM", "ASML"];
const knownEvents: Record<string, { from: string; to: string }> = {
  MU: { from: "2026-06-24", to: "2026-06-24" },
  GOOGL: { from: "2026-07-22", to: "2026-07-22" },
  JPM: { from: "2026-07-14", to: "2026-07-14" },
  TSM: { from: "2026-07-16", to: "2026-07-16" },
  ASML: { from: "2026-07-15", to: "2026-07-15" },
};

const probes: Probe[] = [
  {
    name: "calendar",
    toolId: tools.calendar,
    parameters: { function: "EARNINGS_CALENDAR", horizon: "3month" },
    validate: (data) => typeof data === "string" || Array.isArray(record(data)?.earningsCalendar),
  },
  {
    name: "index-constituents",
    toolId: tools.indexConstituents,
    parameters: { query: "S&P 500 index constituents, include all ticker symbols" },
    validate: (data) => array(data, "results").length > 0,
  },
  {
    name: "sec-submissions",
    toolId: tools.secCompanySubmissions,
    parameters: { cik: "0001652044" },
    validate: (data) => Boolean(record(record(data)?.filings)?.recent),
  },
  {
    name: "profile",
    toolId: tools.profile,
    parameters: { symbol: "MU" },
    validate: (data) => Boolean(record(data)?.name),
  },
  {
    name: "market-cap-batch",
    toolId: tools.marketCapBatch,
    parameters: { symbols: "MU,GOOGL,JPM,TSM,ASML" },
    validate: (data) => Array.isArray(data) && data.length >= 4,
  },
  {
    name: "quote",
    toolId: tools.quote,
    parameters: { s: "MU", fmt: "json" },
    validate: (data) => Boolean(record(data)?.data),
  },
  {
    name: "historical-price",
    toolId: tools.historicalPrice,
    parameters: { symbol: "MU", from: "2026-06-17", to: "2026-07-04" },
    validate: (data) => Array.isArray(data) && data.some((row) => record(row)?.adjClose != null),
  },
  {
    name: "news",
    toolId: tools.news,
    parameters: { query: "MU earnings", limit: 10 },
    validate: (data) => array(data, "results").length > 0,
  },
  {
    name: "filings-cik",
    toolId: tools.filingsCik,
    parameters: { symbol: "GOOGL" },
    validate: (data) => Boolean(record(data)?.cik) || (Array.isArray(data) && data.length > 0),
  },
  {
    name: "filings-search",
    toolId: tools.filingsSearch,
    parameters: { cik: "0001652044", from: "2026-01-01", to: "2026-07-30", page: "0", limit: "5" },
    validate: (data) => Array.isArray(data) && data.length > 0,
  },
  {
    name: "transcript",
    toolId: tools.transcript,
    parameters: { symbol: "MU", quarter: "2026Q3", function: "EARNINGS_CALL_TRANSCRIPT" },
    validate: (data) => array(data, "transcript").length > 0,
  },
  {
    name: "income-statement",
    toolId: tools.incomeStatement,
    parameters: { symbol: "MU", period: "quarter", limit: 4 },
    validate: (data) => Array.isArray(data) && data.some((row) => record(row)?.revenue != null),
  },
  {
    name: "balance-sheet",
    toolId: tools.balanceSheet,
    parameters: { symbol: "MU", period: "quarter", limit: 4 },
    validate: (data) => Array.isArray(data) && data.length > 0,
  },
  {
    name: "cash-flow",
    toolId: tools.cashFlow,
    parameters: { symbol: "MU", period: "quarter", limit: 4 },
    validate: (data) => Array.isArray(data) && data.length > 0,
  },
  {
    name: "revenue-segment",
    toolId: tools.revenueSegment,
    parameters: { symbol: "MU", period: "quarter" },
    validate: (data) => Array.isArray(data) && data.length > 0,
  },
  ...symbols.flatMap((symbol): Probe[] => [
    {
      name: `history:${symbol}`,
      toolId: tools.earningsHistory,
      parameters: { symbol, limit: 8 },
      validate: (data) => Array.isArray(data) && data.some((row) => record(row)?.actual != null && record(row)?.estimate != null),
    },
    {
      name: `report-dates:${symbol}`,
      toolId: tools.earningsDates,
      parameters: { symbol, outputsize: 8, format: "JSON" },
      validate: (data) => array(data, "earnings").some((row) => record(row)?.date && record(row)?.eps_actual != null),
    },
    {
      name: `consensus:${symbol}`,
      toolId: tools.consensusCalendar,
      parameters: { symbol, ...knownEvents[symbol] },
      validate: (data) => array(data, "earningsCalendar").some((row) => {
        const item = record(row);
        return item?.epsEstimate != null && item?.revenueEstimate != null;
      }),
    },
  ]),
];

const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
let registered = new Set<string>();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const inspection = await post("/tools/by-ids", { tool_ids: [...new Set(probes.map((probe) => probe.toolId))] });
  registered = new Set((inspection.results || []).map((item: { tool_id?: string }) => item.tool_id).filter(Boolean));
  const results: Array<{ name: string; toolId: string; ok: boolean; ms: number; reason: string }> = [];
  for (let index = 0; index < probes.length; index += 4) {
    results.push(...await Promise.all(probes.slice(index, index + 4).map(runProbe)));
  }
  console.table(results.map(({ name, ok, ms, reason }) => ({ probe: name, status: ok ? "PASS" : "FAIL", ms, reason })));
  const failures = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failures.length}/${results.length} probes passed.`);
  if (failures.length) process.exitCode = 1;
}

async function runProbe(probe: Probe) {
  const started = Date.now();
  if (!registered.has(probe.toolId)) return result(probe, false, started, "tool is not registered");
  try {
    const payload = await post(`/tools/execute?tool_id=${encodeURIComponent(probe.toolId)}`, {
      tool_id: probe.toolId,
      parameters: probe.parameters,
      max_response_size: 1_000_000,
    });
    if (runtimeSchemaContainsInterval(payload)) return result(probe, false, started, "runtime schema is bound to a technical-indicator tool");
    if (payload.success === false) {
      return result(probe, false, started, String(payload.error_message || payload.result?.error_details || "business failure"));
    }
    const data = await hydrateAttachment(payload.result?.data);
    return result(probe, probe.validate(data), started, probe.validate(data) ? "valid data" : "required fields are empty");
  } catch (error) {
    return result(probe, false, started, error instanceof Error ? error.message : String(error));
  }
}

function result(probe: Probe, ok: boolean, started: number, reason: string) {
  return { name: probe.name, toolId: probe.toolId, ok, ms: Date.now() - started, reason };
}

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function array(value: unknown, key: string): unknown[] {
  const candidate = record(value)?.[key];
  return Array.isArray(candidate) ? candidate : [];
}

function runtimeSchemaContainsInterval(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => item === "1min" || runtimeSchemaContainsInterval(item));
  }
  return Boolean(record(value) && Object.values(record(value)!).some(runtimeSchemaContainsInterval));
}

async function hydrateAttachment(value: unknown) {
  const url = record(value)?.full_content_file_url;
  if (typeof url !== "string") return value;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["oss.qveris.ai", "qveris.ai"].includes(parsed.hostname)) {
    throw new Error("untrusted attachment URL");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`attachment HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error("attachment is too large");
  return text;
}
