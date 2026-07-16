import Link from "next/link";
import { getCompanyProfiles } from "@/lib/earnings/companies";
import { getEarningsCalendar } from "@/lib/earnings/calendar";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import type { CompanyProfile, EarningsEvent } from "@/lib/earnings/types";
import { fmtDate } from "@/lib/formatting/format";
import type { Dict, Lang } from "@/lib/i18n/dict";
import { getDict } from "@/lib/i18n/server";
import { EarningsSearchBox } from "@/components/earnings/EarningsSearchBox";
import { Reveal } from "@/components/Reveal";

export const dynamic = "force-dynamic";

export default async function EarningsConsole() {
  const { lang, t } = await getDict();
  const today = todayIso();
  const calendar = await getEarningsCalendar({ from: addDaysIso(today, -30), to: addDaysIso(today, 30) });
  const dataUnavailable = calendar.issues.length ? dataIssueText() : null;

  const recentEvents = calendar.events
    .filter((event) => event.status === "reported")
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
    .slice(0, 5);
  const upcomingEvents = calendar.events
    .filter((event) => event.status === "upcoming")
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .slice(0, 5);

  const companies = await getCompanyProfiles(
    [...upcomingEvents, ...recentEvents].map((event) => event.ticker),
  );

  return (
    <div className="space-y-20 pb-12">
      {/* hero — search is the product entry */}
      <section className="rise rise-1 mx-auto max-w-3xl pt-20 text-center sm:pt-28">
        <p className="label text-accent">{t.home.kicker}</p>
        <h1 className="mt-3 font-display text-5xl leading-tight text-ink sm:text-6xl">
          {lang === "zh" ? (
            <>
              <span className="block">
                {t.home.heroPre}
                <em className="text-accent">{t.home.heroEm}</em>
              </span>
              <span className="block">{t.home.heroPost}</span>
            </>
          ) : (
            <>
              {t.home.heroPre}
              <em className="text-accent">{t.home.heroEm}</em>
              {t.home.heroPost}
            </>
          )}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-ink-soft">{t.home.heroSub}</p>
        <div className="mx-auto mt-8 max-w-xl">
          <EarningsSearchBox large placeholder={t.search.placeholder} buttonLabel={t.search.button} />
        </div>
      </section>

      {/* events at a glance — jump into an event, no analysis here */}
      <Reveal>
        <section className="grid gap-5 md:grid-cols-2">
          <EventList
            title={t.home.thisWeek}
            events={upcomingEvents}
            companies={companies}
            empty={dataUnavailable ?? t.home.emptyUpcoming}
            t={t}
            lang={lang}
          />
          <EventList
            title={t.home.recentlyReported}
            events={recentEvents}
            companies={companies}
            empty={dataUnavailable ?? t.home.emptyRecent}
            t={t}
            lang={lang}
          />
        </section>
      </Reveal>

      {/* weak secondary entries */}
      <Reveal>
        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          <Link href="/earnings/calendar" className="label text-ink-soft transition-colors hover:text-accent">
            {t.home.fullCalendar}
          </Link>
          <Link href="/earnings/briefs" className="label text-ink-soft transition-colors hover:text-accent">
            {t.nav.briefs} →
          </Link>
          <Link href="/developers/earnings" className="label text-ink-faint transition-colors hover:text-accent">
            {t.devCta.link}
          </Link>
        </nav>
      </Reveal>
    </div>
  );
}

function dataIssueText() {
  return "Data service temporarily unavailable. 数据服务暂时不可用。";
}

function EventList({
  title,
  events,
  companies,
  empty,
  t,
  lang,
}: {
  title: string;
  events: EarningsEvent[];
  companies: Map<string, CompanyProfile>;
  empty: string;
  t: Dict;
  lang: Lang;
}) {
  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="label text-accent">{title}</h2>
        <Link href="/earnings/calendar" className="label text-ink-faint transition-colors hover:text-accent">
          {t.home.fullCalendar}
        </Link>
      </div>
      {events.length ? (
        <ul className="divide-y divide-line">
          {events.map((event) => {
            const reported = event.status === "reported";
            const company = companies.get(event.ticker);
            return (
              <li key={event.id}>
                <Link
                  href={`/earnings/${event.ticker}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="num w-14 shrink-0 text-ink group-hover:text-accent">{event.ticker}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{company?.name ?? event.ticker}</span>
                    <span className="label">
                      {fmtDate(event.reportDate, lang)}
                      {event.fiscalPeriod && ` · ${event.fiscalPeriod}`} · {t.timing[event.timing]}
                    </span>
                  </span>
                  <span
                    className={`label shrink-0 rounded-sm px-1.5 py-0.5 ${reported ? "bg-beat-soft text-beat" : "bg-accent-soft text-accent"}`}
                  >
                    {reported ? t.mode.flash : t.mode.preview}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-4 text-sm text-ink-faint">{empty}</p>
      )}
    </div>
  );
}
