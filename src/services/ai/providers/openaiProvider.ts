import { extractPlannerIntentSignals } from "@/services/ai/intent/intentExtractor";
import type { OpenAIProviderConfig } from "@/services/ai/config";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import { buildLavaSystemPrompt, buildLavaUserPrompt } from "@/services/ai/providers/lavaBoundedPrompt";
import { materializeLavaSupportedRecommendation } from "@/services/ai/providers/lavaMaterializeSupported";
import { materializeLavaUnsupportedRecommendation } from "@/services/ai/providers/lavaMaterializeUnsupported";
import { parseLavaModelPayload } from "@/services/ai/providers/lavaParseModel";
import { requestOpenAiChatCompletionJson } from "@/services/ai/providers/openaiChatCompletion";
import { buildOpenAiTransportUnsupportedResult } from "@/services/ai/providers/openaiTransportFailure";
import type { AIProvider, AIRecommendationRequest } from "@/services/ai/types";
import type { AIRecommendationResult } from "@/shared/types";

export class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  constructor(private readonly config: OpenAIProviderConfig) {}

  recommend(request: AIRecommendationRequest): Promise<AIRecommendationResult | null> {
    if (!request.userPrompt.trim()) {
      return Promise.resolve(null);
    }

    const functionCatalog =
      request.functionCatalog && request.functionCatalog.length > 0
        ? request.functionCatalog
        : buildPlannerFunctionCatalog(request.availablePipelines);

    if (!this.config.chatCompletionsUrl.trim()) {
      return Promise.resolve(
        buildOpenAiTransportUnsupportedResult({
          reasonCode: "provider-not-configured",
          summary: "OpenAI chat URL is not configured.",
          reason:
            "Set VITE_OPENAI_CHAT_COMPLETIONS_URL (default https://api.openai.com/v1/chat/completions) or your compatible endpoint.",
        }),
      );
    }

    if (!this.config.apiKey?.trim()) {
      return Promise.resolve(
        buildOpenAiTransportUnsupportedResult({
          reasonCode: "provider-not-configured",
          summary: "OpenAI API key is not configured.",
          reason:
            "Set VITE_OPENAI_API_KEY (or legacy VITE_LAVA_API_KEY) in the project root .env on the same line as the key, no quotes. Restart the dev server.",
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

    const systemPrompt = buildLavaSystemPrompt({ ...request, functionCatalog });
    const userPrompt = buildLavaUserPrompt(request.userPrompt);

    return requestOpenAiChatCompletionJson({
      config: {
        apiKey: this.config.apiKey.trim(),
        chatCompletionsUrl: this.config.chatCompletionsUrl.trim(),
        model: this.config.model.trim(),
      },
      systemPrompt,
      userPrompt,
    }).then((completion) => {
      if (!completion.ok) {
        return buildOpenAiTransportUnsupportedResult({
          reasonCode: "provider-request-failed",
          summary: "OpenAI did not return a usable planner response.",
          reason: completion.errorMessage,
        });
      }

      const parsed = parseLavaModelPayload(completion.rawJson);
      if (!parsed) {
        return buildOpenAiTransportUnsupportedResult({
          reasonCode: "provider-request-failed",
          summary: "Model output could not be parsed as a bounded planner decision.",
          reason: "The assistant response was not a valid supported/unsupported planner JSON object.",
        });
      }

      if (parsed.kind === "unsupported") {
        return materializeLavaUnsupportedRecommendation(parsed, { providerLabel: this.id });
      }

      const supported = materializeLavaSupportedRecommendation({
        userPrompt: request.userPrompt,
        availablePipelines: request.availablePipelines,
        functionCatalog,
        model: parsed,
        providerLabel: this.id,
      });
      if (!supported) {
        return buildOpenAiTransportUnsupportedResult({
          reasonCode: "provider-request-failed",
          summary: "Supported planner decision could not be materialized against the pipeline registry.",
          reason: "The model chose a pipeline or options that are not available in the current registry context.",
        });
      }

      return supported;
    });
  }
}
