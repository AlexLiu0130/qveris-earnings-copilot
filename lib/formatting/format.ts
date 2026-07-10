const UNAVAILABLE = "unavailable";

export function fmtMoney(value: number | null | undefined, currency = "USD"): string {
  if (value == null) return UNAVAILABLE;
  const abs = Math.abs(value);
  const [scaled, suffix] =
    abs >= 1e12 ? [value / 1e12, "T"] : abs >= 1e9 ? [value / 1e9, "B"] : abs >= 1e6 ? [value / 1e6, "M"] : [value, ""];
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${scaled.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
}

export function fmtEps(value: number | null | undefined): string {
  if (value == null) return UNAVAILABLE;
  return `$${value.toFixed(2)}`;
}

export function fmtPct(value: number | null | undefined, signed = true): string {
  if (value == null) return UNAVAILABLE;
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function fmtNumber(value: number | null | undefined): string {
  if (value == null) return UNAVAILABLE;
  return value.toLocaleString("en-US");
}

export function fmtDate(iso: string | null | undefined, lang: "en" | "zh" = "en"): string {
  if (!iso) return UNAVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNAVAILABLE;
  return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    month: lang === "zh" ? "long" : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return UNAVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNAVAILABLE;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Timing/mode labels now live in lib/i18n/dict.ts (t.timing / t.mode). */
export function fmtTiming(value: string | null | undefined): string {
  return ({
    before_open: "Before open",
    after_close: "After close",
    during_market: "During market",
    unknown: "Timing unknown",
  } as Record<string, string>)[value ?? "unknown"] ?? "Timing unknown";
}

export function fmtMode(value: string | null | undefined): string {
  return ({
    preview: "Preview",
    flash: "Flash",
    call_intelligence: "Call intelligence",
    combined: "Combined",
    no_event: "No near-term event",
  } as Record<string, string>)[value ?? "no_event"] ?? "Research brief";
}
