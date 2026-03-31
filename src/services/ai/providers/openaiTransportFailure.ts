import type { UnsupportedRecommendationResult } from "@/shared/types";
import type { UnsupportedReasonCode } from "@/shared/types/ai";

export function buildOpenAiTransportUnsupportedResult(args: {
  reasonCode: UnsupportedReasonCode;
  summary: string;
  reason: string;
}): UnsupportedRecommendationResult {
  return {
    kind: "unsupported",
    recommendationId: `openai-transport-${Date.now()}`,
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
        id: "openai-transport-fallback",
        kind: "fallback",
        title: "OpenAI request did not complete",
        detail: args.reason,
        sourceFunctionId: "detect_unsupported_request",
      },
    ],
    warnings: ["Planner output was not produced from a successful OpenAI response."],
    assumptions: ["The bounded planner acceptance layer rejected or could not obtain provider output."],
    suggestedResources: [
      {
        id: "openai-transport-note",
        title: "OpenAI troubleshooting",
        description:
          "Verify VITE_OPENAI_API_KEY, optional chat URL and model, account billing limits, and network access to the API.",
        resourceType: "scope-note",
      },
    ],
  };
}
