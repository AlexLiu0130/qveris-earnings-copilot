"use client";

import { useState } from "react";

const STYLES = {
  light: "border-line-strong text-accent hover:border-accent",
  dark: "border-code-line bg-code-header text-accent hover:border-accent hover:bg-surface",
};

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied ✓",
  variant = "light",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={`label border px-3 py-1.5 transition-colors ${STYLES[variant]}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
