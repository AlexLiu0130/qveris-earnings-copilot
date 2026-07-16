import Link from "next/link";
import { getEarningsProvider } from "@/lib/capabilities/provider";
import { getCompanyProfiles } from "@/lib/earnings/companies";
import { getEarningsCalendar } from "@/lib/earnings/calendar";
import { resolveEventEstimates } from "@/lib/earnings/dataQuality";
import { todayIso } from "@/lib/earnings/date";
import type { CompanyProfile, EarningsEstimates, EarningsEvent, EarningsTiming } from "@/lib/earnings/types";
import { fmtDate, fmtEps, fmtMoney } from "@/lib/formatting/format";
import { u, type Dict, type Lang } from "@/lib/i18n/dict";
import { getDict } from "@/lib/i18n/server";
import { parseMinMarketCapBillions } from "./marketCapFilter";

async function getEstimatesByEvent(events: EarningsEvent[]): Promise<Map<string, EarningsEstimates>> {
  const provider = getEarningsProvider();
  const settled = await Promise.allSettled(events.map((event) => (
    event.revenueEstimate != null && event.epsEstimate != null
      ? Promise.resolve(null)
      : provider.getEarningsEstimates(event.ticker, event)
  )));
  const map = new Map<string, EarningsEstimates>();
  settled.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const resolved = resolveEventEstimates(events[i], result.value);
    if (resolved) map.set(events[i].id, resolved);
  });
  return map;
}

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value || undefined;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const leadingBlanks = new Date(`${first}T00:00:00Z`).getUTCDay(); // Sunday-first grid
  return { daysInMonth, first, last, leadingBlanks };
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string, lang: Lang) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { lang, t } = await getDict();
  const sp = await searchParams;
  const today = todayIso();
  const month = /^\d{4}-\d{2}$/.test(first(sp.month) ?? "") ? first(sp.month)! : today.slice(0, 7);
  const status = first(sp.status);
  const timing = first(sp.timing);
  const sector = first(sp.sector);
  const minMarketCapB = first(sp.minMarketCapB);
  const minMarketCap = parseMinMarketCapBillions(minMarketCapB);
  const universeParam = first(sp.universe);
  const universe = universeParam === "popular" || universeParam === "all" ? universeParam : undefined;
  const view = first(sp.view) === "table" ? "table" : "calendar";

  const { daysInMonth, first: fromDate, last: toDate, leadingBlanks } = monthRange(month);

  const calendar = await getEarningsCalendar({
    from: fromDate,
    to: toDate,
    universe,
    sector: sector || undefined,
    status: status === "upcoming" || status === "reported" ? status : undefined,
    minMarketCap,
    timing: (["before_open", "after_close", "during_market", "unknown"] as const).includes(
      timing as EarningsTiming,
    )
      ? (timing as EarningsTiming)
      : undefined,
  });
  const dataUnavailable = calendar.issues.length ? dataIssueText() : null;

  const companies = await getCompanyProfiles(calendar.events.map((event) => event.ticker));
  const estimates = view === "table" ? await getEstimatesByEvent(calendar.events) : new Map<string, EarningsEstimates>();
  const byDay = new Map<string, EarningsEvent[]>();
  for (const event of calendar.events) {
    const list = byDay.get(event.reportDate) ?? [];
    list.push(event);
    byDay.set(event.reportDate, list);
  }

  const filterParams = Object.entries({
    status,
    timing,
    sector,
    universe,
    minMarketCapB: minMarketCap == null ? undefined : minMarketCapB,
    view: view === "table" ? "table" : undefined,
  })
    .filter(([, v]) => v)
    .map(([k, v]) => [k, v!] as [string, string]);
  const monthHref = (m: string) =>
    `/earnings/calendar?${new URLSearchParams([["month", m], ...filterParams]).toString()}`;
  const viewHref = (v: string) =>
    `/earnings/calendar?${new URLSearchParams([
      ["month", month],
      ...filterParams.filter(([k]) => k !== "view"),
      ...(v === "table" ? [["view", "table"] as [string, string]] : []),
    ]).toString()}`;

  return (
    <div className="space-y-5">
      <header className="rise rise-1">
        <h1 className="font-display text-4xl text-ink">{t.calendarPage.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t.calendarPage.sub}</p>
      </header>

      {/* toolbar: month nav + filters + view toggle */}
      <div className="panel rise rise-2 flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-1">
          <Link href={monthHref(shiftMonth(month, -1))} aria-label="previous month" className={navBtn}>
            {t.calendarPage.prevMonth}
          </Link>
          <span className="num min-w-32 px-2 text-center text-lg text-ink">{monthTitle(month, lang)}</span>
          <Link href={monthHref(shiftMonth(month, 1))} aria-label="next month" className={navBtn}>
            {t.calendarPage.nextMonth}
          </Link>
          <Link href={monthHref(today.slice(0, 7))} className="label ml-1 px-2 py-1.5 text-accent hover:underline">
            {t.calendarPage.today}
          </Link>
        </div>

        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="month" value={month} />
          {view === "table" && <input type="hidden" name="view" value="table" />}
          <select name="universe" defaultValue={universe ?? ""} className={inputCls} aria-label={t.calendarPage.universe}>
            <option value="">{t.calendarPage.universe}: {t.calendarPage.universeCore}</option>
            <option value="popular">{t.calendarPage.universePopular}</option>
            <option value="all">{t.calendarPage.universeAll}</option>
          </select>
          <select name="status" defaultValue={status ?? ""} className={inputCls} aria-label={t.calendarPage.status}>
            <option value="">{t.calendarPage.status}: {t.calendarPage.all}</option>
            <option value="upcoming">{t.calendarPage.upcoming}</option>
            <option value="reported">{t.calendarPage.reported}</option>
          </select>
          <select name="timing" defaultValue={timing ?? ""} className={inputCls} aria-label={t.calendarPage.timing}>
            <option value="">{t.calendarPage.timing}: {t.calendarPage.all}</option>
            <option value="before_open">{t.timing.before_open}</option>
            <option value="after_close">{t.timing.after_close}</option>
            <option value="during_market">{t.timing.during_market}</option>
          </select>
          <input
            type="text"
            name="sector"
            defaultValue={sector ?? ""}
            placeholder={t.calendarPage.sectorPlaceholder}
            className={`${inputCls} w-36`}
            aria-label={t.calendarPage.sector}
          />
          <input
            type="number"
            name="minMarketCapB"
            defaultValue={minMarketCap == null ? "" : minMarketCapB}
            min="0"
            step="1"
            placeholder="Min market cap ($B)"
            className={`${inputCls} w-44`}
            aria-label="Minimum market cap in billions of US dollars"
          />
          <button type="submit" className="label border border-accent px-3 py-2 text-accent transition-colors hover:bg-accent hover:text-canvas">
            {t.calendarPage.apply}
          </button>
        </form>

        <div className="ml-auto flex items-center gap-1">
          {(["calendar", "table"] as const).map((v) => (
            <Link
              key={v}
              href={viewHref(v)}
              className={`label border px-3 py-2 transition-colors ${
                view === v ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-ink-faint hover:text-ink-soft"
              }`}
            >
              {v === "calendar" ? t.calendarPage.viewCalendar : t.calendarPage.viewTable}
            </Link>
          ))}
        </div>
      </div>

      <section className="rise rise-3">
        {view === "calendar" ? (
          <MonthGrid
            month={month}
            daysInMonth={daysInMonth}
            leadingBlanks={leadingBlanks}
            byDay={byDay}
            companies={companies}
            today={today}
            t={t}
          />
        ) : (
          <EventsTable events={calendar.events} companies={companies} estimates={estimates} t={t} lang={lang} />
        )}
        {calendar.events.length === 0 && (
          <p className="mt-3 text-center text-sm text-ink-faint">{dataUnavailable ?? t.calendarPage.emptyMonth}</p>
        )}
      </section>

      <p className="label rise rise-4">
        {t.calendarPage.counts(calendar.events.length, calendar.sources.length)}
      </p>
    </div>
  );
}

function MonthGrid({
  month,
  daysInMonth,
  leadingBlanks,
  byDay,
  companies,
  today,
  t,
}: {
  month: string;
  daysInMonth: number;
  leadingBlanks: number;
  byDay: Map<string, EarningsEvent[]>;
  companies: Map<string, CompanyProfile>;
  today: string;
  t: Dict;
}) {
  const cells: Array<{ date: string; day: number } | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${month}-${String(i + 1).padStart(2, "0")}`,
      day: i + 1,
    })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">
        {t.calendarPage.weekdays.map((day) => (
          <div key={day} className="label px-2 py-2 text-center">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`min-h-24 border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0 ${
              cell ? "" : "bg-surface-2/50"
            }`}
          >
            {cell && (
              <>
                <span
                  className={`num inline-flex h-6 w-6 items-center justify-center text-xs ${
                    cell.date === today ? "rounded-full bg-accent text-white" : "text-ink-faint"
                  }`}
                >
                  {cell.day}
                </span>
                <div className="mt-1 space-y-1">
                  {(byDay.get(cell.date) ?? []).map((event) => {
                    const reported = event.status === "reported";
                    const company = companies.get(event.ticker);
                    return (
                      <Link
                        key={event.id}
                        href={`/earnings/${event.ticker}`}
                        title={`${company?.name ?? event.ticker} · ${t.timing[event.timing]}`}
                        className={`block rounded-sm px-1.5 py-1 transition-opacity hover:opacity-75 ${
                          reported ? "bg-beat-soft" : "bg-accent-soft"
                        }`}
                      >
                        <span className={`num block text-xs font-medium ${reported ? "text-beat" : "text-accent"}`}>
                          {event.ticker}
                          <span className="ml-1 font-normal opacity-70">
                            {event.timing === "before_open" ? "AM" : event.timing === "after_close" ? "PM" : ""}
                          </span>
                        </span>
                        {company?.name && (
                          <span className="block truncate text-[10px] leading-tight text-ink-faint">
                            {company.name}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventsTable({
  events,
  companies,
  estimates,
  t,
  lang,
}: {
  events: EarningsEvent[];
  companies: Map<string, CompanyProfile>;
  estimates: Map<string, EarningsEstimates>;
  t: Dict;
  lang: Lang;
}) {
  if (events.length === 0) return null;
  const un = t.common.unavailable;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="label text-left [&>th]:px-4 [&>th]:py-3 [&>th]:font-normal">
            <th>{t.calendarPage.thTicker}</th>
            <th>{t.calendarPage.thCompany}</th>
            <th>{t.calendarPage.thReportDate}</th>
            <th>{t.calendarPage.thPeriod}</th>
            <th>{t.calendarPage.thTiming}</th>
            <th>{t.calendarPage.thEpsEst}</th>
            <th>{t.calendarPage.thRevEst}</th>
            <th>{t.calendarPage.thStatus}</th>
            <th>{t.calendarPage.thBrief}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const company = companies.get(event.ticker);
            const estimate = estimates.get(event.id);
            return (
              <tr key={event.id} className="border-t border-line transition-colors hover:bg-surface-2">
                <td className="num px-4 py-3 text-ink">
                  <Link href={`/earnings/${event.ticker}`} className="hover:text-accent">
                    {event.ticker}
                  </Link>
                </td>
                <td className="max-w-48 truncate px-4 py-3 text-ink-soft">{company?.name ?? "—"}</td>
                <td className="num px-4 py-3 text-ink-soft">{fmtDate(event.reportDate, lang)}</td>
                <td className="num px-4 py-3 text-ink-soft">{event.fiscalPeriod ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{t.timing[event.timing]}</td>
                <td className="num px-4 py-3 text-ink-soft">{u(fmtEps(estimate?.epsEstimate), un)}</td>
                <td className="num px-4 py-3 text-ink-soft">{u(fmtMoney(estimate?.revenueEstimate), un)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`label rounded-sm px-1.5 py-0.5 ${
                      event.status === "reported" ? "bg-beat-soft text-beat" : "bg-accent-soft text-accent"
                    }`}
                  >
                    {event.status === "reported" ? t.eventCard.reported : t.eventCard.upcoming}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/earnings/${event.ticker}`} className="label text-accent hover:underline">
                    {event.status === "reported" ? t.calendarPage.flashLink : t.calendarPage.previewLink}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const navBtn =
  "num border border-line-strong px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent hover:text-accent";
const inputCls =
  "num border border-line-strong bg-surface px-2.5 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

function dataIssueText() {
  return "Data service temporarily unavailable. 数据服务暂时不可用。";
}
