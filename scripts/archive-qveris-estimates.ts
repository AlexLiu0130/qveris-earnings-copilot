import { QVerisCapabilityProvider } from "../lib/capabilities/QVerisCapabilityProvider";
import { addDaysIso, todayIso } from "../lib/earnings/date";
import { saveCalendarSnapshot } from "../lib/earnings/analysisStore";
import { sourceIdsFrom, uniqueSources } from "../lib/earnings/sourceRefs";
import { getD1 } from "../lib/storage/d1";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const days = Number(process.env.EARNINGS_ARCHIVE_DAYS ?? 21);
  if (!Number.isInteger(days) || days < 1 || days > 120) throw new Error("EARNINGS_ARCHIVE_DAYS must be an integer from 1 to 120");
  if (!getD1()) throw new Error("Persistent D1 or SQLite storage is required");
  const from = process.env.EARNINGS_ARCHIVE_FROM ?? todayIso();
  const to = process.env.EARNINGS_ARCHIVE_TO ?? addDaysIso(from, days);
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new Error("EARNINGS_ARCHIVE_FROM and EARNINGS_ARCHIVE_TO must be an ordered YYYY-MM-DD range");

  const provider = new QVerisCapabilityProvider();
  const events = await provider.getEarningsCalendar({
    from,
    to,
    universe: process.env.EARNINGS_UNIVERSE ?? "core",
  });

  const archived = [];
  const failures: string[] = [];
  for (let index = 0; index < events.length; index += 4) {
    archived.push(...await Promise.all(events.slice(index, index + 4).map(async (event) => {
      const estimates = await provider.getEarningsEstimates(event.ticker, event).catch(() => {
        failures.push(event.ticker);
        return null;
      });
      return {
        ...event,
        revenueEstimate: estimates?.revenueEstimate ?? event.revenueEstimate,
        epsEstimate: estimates?.epsEstimate ?? event.epsEstimate,
        sourceIds: [...new Set([...event.sourceIds, ...(estimates?.sourceIds ?? [])])],
      };
    })));
  }

  const sourceIds = sourceIdsFrom(...archived);
  const sources = uniqueSources(provider.getSourceRefs()).filter((source) => sourceIds.includes(source.id));
  await saveCalendarSnapshot(archived, sources);

  console.log(JSON.stringify({
    from,
    to,
    events: archived.length,
    revenueEstimates: archived.filter((event) => event.revenueEstimate != null).length,
    epsEstimates: archived.filter((event) => event.epsEstimate != null).length,
    missingRevenue: archived.filter((event) => event.revenueEstimate == null).map((event) => event.ticker),
    missingEps: archived.filter((event) => event.epsEstimate == null).map((event) => event.ticker),
    failures,
  }));
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
