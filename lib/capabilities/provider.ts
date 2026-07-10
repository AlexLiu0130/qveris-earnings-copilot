import { HybridEarningsCapabilityProvider } from "@/lib/capabilities/HybridEarningsCapabilityProvider";
import { MockEarningsCapabilityProvider } from "@/lib/capabilities/MockEarningsCapabilityProvider";
import { QVerisCapabilityProvider } from "@/lib/capabilities/QVerisCapabilityProvider";
import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";

export function getEarningsProvider(): EarningsCapabilityProvider {
  const mode = (process.env.EARNINGS_PROVIDER ?? "qveris").toLowerCase();
  if (mode === "qveris") return new QVerisCapabilityProvider();
  if (mode === "hybrid") {
    return new HybridEarningsCapabilityProvider({
      primary: new QVerisCapabilityProvider(),
      fallback: new MockEarningsCapabilityProvider(),
      allowDemoFallback: process.env.ALLOW_DEMO_DATA === "true",
    });
  }
  return new MockEarningsCapabilityProvider();
}
