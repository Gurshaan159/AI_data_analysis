import type { AIProviderId } from "@/services/ai/config";
import type { AIRecommendationResult, PipelineDefinition, PlannerFunctionCatalogEntry } from "@/shared/types";

export interface AIRecommendationRequest {
  availablePipelines: PipelineDefinition[];
  userPrompt: string;
  functionCatalog?: PlannerFunctionCatalogEntry[];
}

export interface AIProvider {
  readonly id: AIProviderId;
  recommend(request: AIRecommendationRequest): Promise<AIRecommendationResult | null>;
}
