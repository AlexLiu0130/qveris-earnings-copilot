"use client";

import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n/dict";

export function LanguageToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const next = lang === "en" ? "zh" : "en";

  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `lang=${next};path=/;max-age=31536000`;
        router.refresh();
      }}
      className="label shrink-0 whitespace-nowrap border border-line-strong px-2 py-1 transition-colors hover:border-accent hover:text-accent"
      aria-label={next === "zh" ? "切换到中文" : "Switch to English"}
    >
      {next === "zh" ? "中文" : "EN"}
    </button>
  );
}
