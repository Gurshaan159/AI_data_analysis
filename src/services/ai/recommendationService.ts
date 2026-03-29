import { getAIProvider } from "@/services/ai/providerFactory";
import type { AIRecommendationRequest } from "@/services/ai/types";
import type { AIRecommendationResult } from "@/shared/types";

export function recommendWorkflow(request: AIRecommendationRequest): Promise<AIRecommendationResult | null> {
  return getAIProvider().recommend(request);
}
