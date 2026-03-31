import type { LavaModelUnsupportedPayload } from "@/services/ai/providers/lavaModelPayload";
import type { PlannerFunctionCall, UnsupportedRecommendationResult } from "@/shared/types";

function recommendationId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export function materializeLavaUnsupportedRecommendation(
  model: LavaModelUnsupportedPayload,
  options?: { providerLabel?: string },
): UnsupportedRecommendationResult {
  const providerLabel = options?.providerLabel ?? "openai";
  const plannerFunctionCalls: PlannerFunctionCall[] = [
    {
      functionId: "detect_unsupported_request",
      arguments: {
        reasonCode: model.unsupportedReasonCode,
        reason: model.reason,
      },
    },
  ];
  if (model.closestSupportedPipelineId) {
    plannerFunctionCalls.push({
      functionId: "suggest_closest_supported_workflow",
      arguments: { pipelineId: model.closestSupportedPipelineId },
    });
  }

  const defaultExplanations: UnsupportedRecommendationResult["explanations"] = [
    {
      id: "planner-unsupported-fallback",
      kind: "fallback",
      title: "Unsupported request",
      detail: model.reason,
      sourceFunctionId: "detect_unsupported_request",
    },
  ];
  const explanations =
    model.explanations?.length && model.explanations.length > 0 ? model.explanations : defaultExplanations;

  return {
    kind: "unsupported",
    recommendationId: recommendationId(`${providerLabel}-unsupported`),
    unsupportedReasonCode: model.unsupportedReasonCode,
    summary: model.summary,
    reason: model.reason,
    closestSupportedPipelineId: model.closestSupportedPipelineId,
    plannerFunctionCalls,
    explanations,
    warnings: model.warnings ?? ["This request was classified as outside the supported planner universe."],
    assumptions: model.assumptions ?? ["Only bounded v1 planner pipelines may be recommended."],
    suggestedResources: [
      {
        id: "supported-universe-note",
        title: "Supported workflow universe (v1)",
        description: "v1 supports matrix-first count analysis and bulk-RNA matrix downstream analysis only.",
        resourceType: "scope-note",
      },
    ],
  };
}
