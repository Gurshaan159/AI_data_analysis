import type { UnsupportedRecommendationResult } from "@/shared/types";

export function isProviderFailureUnsupported(recommendation: UnsupportedRecommendationResult): boolean {
  return (
    recommendation.unsupportedReasonCode === "provider-not-configured" ||
    recommendation.unsupportedReasonCode === "provider-request-failed"
  );
}

/** Runtime/policy validation rejected provider output (distinct from user-scope unsupported). */
export function isPlannerGuardrailUnsupported(recommendation: UnsupportedRecommendationResult): boolean {
  return (
    recommendation.unsupportedReasonCode === "invalid-provider-output-shape" ||
    recommendation.unsupportedReasonCode === "planner-policy-violation"
  );
}
