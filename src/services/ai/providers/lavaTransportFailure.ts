import type { UnsupportedRecommendationResult } from "@/shared/types";
import type { UnsupportedReasonCode } from "@/shared/types/ai";

export function buildLavaTransportUnsupportedResult(args: {
  reasonCode: UnsupportedReasonCode;
  summary: string;
  reason: string;
}): UnsupportedRecommendationResult {
  return {
    kind: "unsupported",
    recommendationId: `lava-transport-${Date.now()}`,
    unsupportedReasonCode: args.reasonCode,
    summary: args.summary,
    reason: args.reason,
    closestSupportedPipelineId: null,
    plannerFunctionCalls: [
      {
        functionId: "detect_unsupported_request",
        arguments: {
          reasonCode: args.reasonCode,
          reason: args.reason,
        },
      },
    ],
    explanations: [
      {
        id: "lava-transport-fallback",
        kind: "fallback",
        title: "Lava provider request did not complete",
        detail: args.reason,
        sourceFunctionId: "detect_unsupported_request",
      },
    ],
    warnings: ["Planner output was not produced from a successful Lava response."],
    assumptions: ["The bounded planner acceptance layer rejected or could not obtain provider output."],
    suggestedResources: [
      {
        id: "lava-transport-note",
        title: "Lava provider troubleshooting",
        description: "Verify API base URL, secret key, wallet balance, and network access to the Lava gateway.",
        resourceType: "scope-note",
      },
    ],
  };
}
