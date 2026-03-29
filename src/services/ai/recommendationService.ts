import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { acceptProviderPlannerResult } from "@/services/ai/planner/resultAcceptance";
import { getAIProvider } from "@/services/ai/providerFactory";
import type { AIRecommendationRequest } from "@/services/ai/types";
import type { AIRecommendationResult } from "@/shared/types";

export async function recommendWorkflow(request: AIRecommendationRequest): Promise<AIRecommendationResult | null> {
  const functionCatalog =
    request.functionCatalog && request.functionCatalog.length > 0
      ? request.functionCatalog
      : buildPlannerFunctionCatalog(request.availablePipelines);
  const provider = getAIProvider();
  // v1 boundary: provider outputs are never trusted directly; all results pass runtime+policy acceptance.
  const providerResult = (await provider.recommend({ ...request, functionCatalog })) as unknown;
  const acceptance = acceptProviderPlannerResult(providerResult, {
    availablePipelines: request.availablePipelines,
    functionCatalog,
    providerLabel: provider.id,
  });
  return acceptance.result;
}
