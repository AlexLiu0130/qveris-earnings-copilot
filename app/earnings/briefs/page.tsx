import { EarningsEventCard } from "@/components/earnings/EarningsEventCard";
import { getEarningsCalendar } from "@/lib/earnings/calendar";
import { addDaysIso, todayIso } from "@/lib/earnings/date";
import type { EarningsEvent } from "@/lib/earnings/types";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const { t } = await getDict();
  const today = todayIso();
  const calendar = await getEarningsCalendar({ from: addDaysIso(today, -30), to: addDaysIso(today, 45) });
  const flashes = calendar.events
    .filter((event) => event.status === "reported")
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
    .slice(0, 6);
  const previews = calendar.events
    .filter((event) => event.status === "upcoming")
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .slice(0, 6);

  return (
    <div className="space-y-10">
      <header className="rise rise-1">
        <h1 className="font-display text-4xl text-ink">{t.briefsPage.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t.briefsPage.sub}</p>
      </header>
      <BriefSection title={t.briefsPage.latestFlash} events={flashes} emptyText={t.briefsPage.emptyFlash} className="rise rise-2" />
      <BriefSection title={t.briefsPage.upcomingPreviews} events={previews} emptyText={t.briefsPage.emptyPreviews} className="rise rise-3" />
    </div>
  );
}

function BriefSection({
  title,
  events,
  emptyText,
  className,
}: {
  title: string;
  events: EarningsEvent[];
  emptyText: string;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="label mb-3 text-accent">{title}</h2>
      {events.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EarningsEventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <p className="panel p-4 text-sm text-ink-faint">{emptyText}</p>
      )}
    </section>
  );
}
