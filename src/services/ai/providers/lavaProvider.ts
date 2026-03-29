import { extractPlannerIntentSignals } from "@/services/ai/intent/intentExtractor";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import type { LavaProviderConfig } from "@/services/ai/config";
import { buildLavaSystemPrompt, buildLavaUserPrompt } from "@/services/ai/providers/lavaBoundedPrompt";
import { lavaChatConfigFromEnv, requestLavaChatCompletionJson } from "@/services/ai/providers/lavaChatCompletion";
import { materializeLavaSupportedRecommendation } from "@/services/ai/providers/lavaMaterializeSupported";
import { materializeLavaUnsupportedRecommendation } from "@/services/ai/providers/lavaMaterializeUnsupported";
import { parseLavaModelPayload } from "@/services/ai/providers/lavaParseModel";
import { buildLavaTransportUnsupportedResult } from "@/services/ai/providers/lavaTransportFailure";
import type { AIProvider, AIRecommendationRequest } from "@/services/ai/types";
import type { AIRecommendationResult } from "@/shared/types";

export class LavaAIProvider implements AIProvider {
  readonly id = "lava" as const;
  constructor(private readonly config: LavaProviderConfig) {}

  recommend(request: AIRecommendationRequest): Promise<AIRecommendationResult | null> {
    if (!request.userPrompt.trim()) {
      return Promise.resolve(null);
    }

    const functionCatalog =
      request.functionCatalog && request.functionCatalog.length > 0
        ? request.functionCatalog
        : buildPlannerFunctionCatalog(request.availablePipelines);

    if (!this.config.baseUrl.trim()) {
      return Promise.resolve(
        buildLavaTransportUnsupportedResult({
          reasonCode: "provider-not-configured",
          summary: "Lava gateway base URL is not configured.",
          reason: "Set VITE_LAVA_API_BASE_URL to your Lava API base (for example https://api.lava.so/v1).",
        }),
      );
    }

    if (!this.config.apiKey?.trim()) {
      return Promise.resolve(
        buildLavaTransportUnsupportedResult({
          reasonCode: "provider-not-configured",
          summary: "Lava API key is not configured.",
          reason: "Set VITE_LAVA_API_KEY to your Lava merchant secret key.",
        }),
      );
    }

    const intent = extractPlannerIntentSignals(request.userPrompt).signals;
    if (intent.constraints.unsupportedAnalysisRequested) {
      return Promise.resolve(
        planWithBoundedCatalog({
          userPrompt: request.userPrompt,
          availablePipelines: request.availablePipelines,
          functionCatalog,
          providerLabel: this.id,
        }),
      );
    }

    const chatConfig = lavaChatConfigFromEnv(this.config, {
      chatCompletionsUrl: this.config.chatCompletionsUrl,
      model: this.config.model,
    });

    const systemPrompt = buildLavaSystemPrompt({ ...request, functionCatalog });
    const userPrompt = buildLavaUserPrompt(request.userPrompt);

    return requestLavaChatCompletionJson({
      config: chatConfig,
      systemPrompt,
      userPrompt,
    }).then((completion) => {
      if (!completion.ok) {
        return buildLavaTransportUnsupportedResult({
          reasonCode: "provider-request-failed",
          summary: "Lava gateway request did not return a usable planner response.",
          reason: completion.errorMessage,
        });
      }

      const parsed = parseLavaModelPayload(completion.rawJson);
      if (!parsed) {
        return buildLavaTransportUnsupportedResult({
          reasonCode: "provider-request-failed",
          summary: "Lava model output could not be parsed as a bounded planner decision.",
          reason: "The assistant response was not a valid supported/unsupported planner JSON object.",
        });
      }

      if (parsed.kind === "unsupported") {
        return materializeLavaUnsupportedRecommendation(parsed);
      }

      const supported = materializeLavaSupportedRecommendation({
        userPrompt: request.userPrompt,
        availablePipelines: request.availablePipelines,
        functionCatalog,
        model: parsed,
      });
      if (!supported) {
        return buildLavaTransportUnsupportedResult({
          reasonCode: "provider-request-failed",
          summary: "Lava supported decision could not be materialized against the pipeline registry.",
          reason: "The model chose a pipeline or options that are not available in the current registry context.",
        });
      }

      return supported;
    });
  }
}
