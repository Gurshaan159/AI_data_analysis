import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import type { AIProvider, AIRecommendationRequest } from "@/services/ai/types";
import type { AIRecommendationResult } from "@/shared/types";

export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;

  recommend(request: AIRecommendationRequest): Promise<AIRecommendationResult | null> {
    return Promise.resolve(
      planWithBoundedCatalog({
        userPrompt: request.userPrompt,
        availablePipelines: request.availablePipelines,
        functionCatalog: request.functionCatalog ?? buildPlannerFunctionCatalog(request.availablePipelines),
        providerLabel: this.id,
      }),
    );
  }
}
