import type { CapabilityState } from "@/lib/earnings/types";

export function stateFor(value: unknown, options: { demo?: boolean; partial?: boolean } = {}): CapabilityState {
  if (options.demo) return "demo";
  if (options.partial) return "partial";
  if (Array.isArray(value)) return value.length > 0 ? "available" : "unavailable";
  if (value == null) return "unavailable";
  if (typeof value === "object" && "available" in value && value.available === false) return "unavailable";
  return "available";
}

export function missingFromStatus(status: Record<string, CapabilityState>) {
  return Object.entries(status)
    .filter(([, state]) => state === "unavailable")
    .map(([key]) => key);
}
