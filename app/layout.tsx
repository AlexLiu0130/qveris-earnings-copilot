import type { Metadata } from "next";
import Link from "next/link";
import { LanguageToggle } from "@/components/LanguageToggle";
import { getDict } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "QVeris Earnings Copilot",
  description:
    "Source-cited earnings research: previews, flash reports, and call intelligence with a full audit trail. Research information only, not investment advice.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getDict();
  const nav = [
    { href: "/earnings", label: t.nav.console },
    { href: "/earnings/calendar", label: t.nav.calendar },
    { href: "/earnings/briefs", label: t.nav.briefs },
    { href: "/developers/earnings", label: t.nav.developers },
  ];

  return (
    <html lang={lang === "zh" ? "zh-CN" : "en"}>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
            <Link href="/earnings" className="flex shrink-0 items-baseline gap-2">
              <span className="font-display text-xl italic text-ink">QVeris</span>
              <span className="label text-accent">Earnings</span>
            </Link>
            <nav className="order-3 flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:order-none sm:w-auto sm:flex-nowrap sm:gap-4">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="label px-2 py-1 transition-colors hover:text-accent"
                >
                  {item.label}
                </Link>
              ))}
              <LanguageToggle lang={lang} />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="mt-16 border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:px-6">
            <p className="label">{t.footer.line1}</p>
            <p className="text-xs text-ink-faint">{t.footer.line2}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
