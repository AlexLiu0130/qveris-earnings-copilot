import Link from "next/link";
import type { CompanyProfile, EarningsEvent } from "@/lib/earnings/types";
import { fmtDate } from "@/lib/formatting/format";
import { getDict } from "@/lib/i18n/server";

export async function EarningsEventCard({
  event,
  company,
}: {
  event: EarningsEvent;
  company?: CompanyProfile;
}) {
  const { lang, t } = await getDict();
  const reported = event.status === "reported";
  return (
    <Link
      href={`/earnings/${event.ticker}`}
      className="panel group block p-4 transition-colors hover:border-accent-dim"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-lg text-ink group-hover:text-accent">{event.ticker}</span>
        <span
          className={`label rounded-sm px-1.5 py-0.5 ${reported ? "bg-beat-soft text-beat" : "bg-accent-soft text-accent"}`}
        >
          {reported ? t.mode.flash : t.mode.preview}
        </span>
      </div>
      {company?.name && (
        <p className="mt-0.5 truncate text-sm text-ink-soft">{company.name}</p>
      )}
      <p className="num mt-2 text-sm text-ink-soft">
        {fmtDate(event.reportDate, lang)}
        {event.fiscalPeriod && ` · ${event.fiscalPeriod}`}
      </p>
      <p className="label mt-1">
        {t.timing[event.timing]} · {reported ? t.eventCard.reported : t.eventCard.upcoming}
      </p>
    </Link>
  );
}
