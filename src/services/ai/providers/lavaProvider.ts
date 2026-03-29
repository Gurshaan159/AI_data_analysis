import type { LavaProviderConfig } from "@/services/ai/config";
import type { AIProvider, AIRecommendationRequest } from "@/services/ai/types";
import type { AIRecommendationResult } from "@/shared/types";

export class LavaAIProvider implements AIProvider {
  readonly id = "lava" as const;
  constructor(private readonly config: LavaProviderConfig) {}

  recommend(request: AIRecommendationRequest): Promise<AIRecommendationResult | null> {
    if (!request.userPrompt.trim()) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      kind: "unsupported",
      recommendationId: `lava-stub-${Date.now()}`,
      unsupportedReasonCode: "outside-supported-universe",
      summary: "Lava provider selected, but real planner inference transport is not implemented yet.",
      reason: `Lava planner provider stub is configured. Configure implementation against ${this.config.baseUrl} when ready.`,
      closestSupportedPipelineId: null,
      plannerFunctionCalls: [
        {
          functionId: "detect_unsupported_request",
          arguments: {
            reasonCode: "outside-supported-universe",
            reason: "Lava transport path is intentionally stubbed for this phase.",
          },
        },
      ],
      explanations: [
        {
          id: "lava-provider-stub",
          kind: "fallback",
          title: "Provider stub active",
          detail: "Lava provider is selected but currently returns fallback while planner contract integration is being prepared.",
          sourceFunctionId: "detect_unsupported_request",
        },
      ],
      warnings: ["Lava provider is currently a placeholder stub."],
      assumptions: ["Provider selection is functional; inference transport is intentionally not implemented yet."],
      suggestedResources: [
        {
          id: "lava-stub-doc",
          title: "Lava provider integration placeholder",
          description: "Placeholder entry documenting that lava planning transport has not been implemented in this phase.",
          resourceType: "placeholder",
          citation: "Internal placeholder",
        },
      ],
    });
  }
}
