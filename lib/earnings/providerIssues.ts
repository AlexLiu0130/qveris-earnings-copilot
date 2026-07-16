import { QVerisCapabilityError } from "@/lib/capabilities/QVerisCapabilityProvider";
import type { DataIssue } from "@/lib/earnings/types";

export function isQVerisCapabilityError(error: unknown): error is QVerisCapabilityError {
  return error instanceof QVerisCapabilityError || (
    error instanceof Error &&
    error.name === "QVerisCapabilityError" &&
    "toolId" in error &&
    "errorType" in error
  );
}

export function dataIssue(capability: string, code: string, error: QVerisCapabilityError): DataIssue {
  return {
    capability,
    code,
    errorType: error.errorType,
    statusCode: error.statusCode,
    toolId: error.toolId,
    retryable: isRetryable(error),
    occurredAt: new Date().toISOString(),
  };
}

export function providerUnavailableError(error: QVerisCapabilityError) {
  const issue = dataIssue("provider", "QVERIS_CAPABILITY_UNAVAILABLE", error);
  return {
    error: issue.code,
    issue,
  };
}

function isRetryable(error: QVerisCapabilityError) {
  if (error.errorType === "timeout" || error.errorType === "network_error") return true;
  return error.statusCode === 429 || (error.statusCode != null && error.statusCode >= 500);
}
