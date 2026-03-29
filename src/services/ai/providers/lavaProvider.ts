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
      summary: "Lava provider selected, but real inference is not implemented yet.",
      reason: `Lava provider stub is configured. Configure implementation against ${this.config.baseUrl} when ready.`,
      warnings: ["Lava provider is currently a placeholder stub."],
      assumptions: ["Provider selection is functional; inference transport is intentionally not implemented yet."],
      suggestedResources: [
        {
          id: "lava-stub-doc",
          title: "Lava provider integration placeholder",
          citation: "Internal placeholder",
          url: "https://example.org/lava-provider-placeholder",
        },
      ],
    });
  }
}
