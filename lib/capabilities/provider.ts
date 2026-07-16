import { HybridEarningsCapabilityProvider } from "@/lib/capabilities/HybridEarningsCapabilityProvider";
import { MockEarningsCapabilityProvider } from "@/lib/capabilities/MockEarningsCapabilityProvider";
import { QVerisCapabilityProvider } from "@/lib/capabilities/QVerisCapabilityProvider";
import type { EarningsCapabilityProvider } from "@/lib/capabilities/EarningsCapabilityProvider";

type ProviderEnv = {
  [key: string]: string | undefined;
  EARNINGS_PROVIDER?: string;
  ALLOW_DEMO_DATA?: string;
};

export function getEarningsProvider(env: ProviderEnv = process.env): EarningsCapabilityProvider {
  const mode = (env.EARNINGS_PROVIDER ?? "qveris").toLowerCase();
  const allowDemoData = env.ALLOW_DEMO_DATA === "true";
  if (mode === "qveris") return new QVerisCapabilityProvider();
  if (mode === "hybrid") {
    return new HybridEarningsCapabilityProvider({
      primary: new QVerisCapabilityProvider(),
      fallback: new MockEarningsCapabilityProvider(),
      allowDemoFallback: allowDemoData,
    });
  }
  if (mode === "mock" && allowDemoData) return new MockEarningsCapabilityProvider();
  if (mode === "mock") throw new Error("MOCK_PROVIDER_NOT_ALLOWED");
  throw new Error("INVALID_EARNINGS_PROVIDER");
}
