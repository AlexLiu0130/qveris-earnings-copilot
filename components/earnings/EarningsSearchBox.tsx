"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EarningsSearchBox({
  large = false,
  placeholder = "Ticker — NVDA, MSFT, TSLA…",
  buttonLabel = "Analyze",
}: {
  large?: boolean;
  placeholder?: string;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const ticker = value.trim().toUpperCase();
        if (ticker) router.push(`/earnings/${encodeURIComponent(ticker)}`);
      }}
      className={`flex items-stretch border border-line-strong bg-surface focus-within:border-accent ${large ? "text-lg" : "text-sm"}`}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={buttonLabel}
        className={`num w-full bg-transparent text-ink placeholder:text-ink-faint focus:outline-none ${large ? "px-4 py-3" : "px-3 py-2"}`}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        className={`label shrink-0 border-l border-line-strong text-accent transition-colors hover:bg-surface-2 ${large ? "px-5" : "px-4"}`}
      >
        {buttonLabel}
      </button>
    </form>
  );
}
