import { appEnv } from "@/config/env";

export type AIProviderId = "mock" | "openai";

export interface OpenAIProviderConfig {
  apiKey: string | null;
  chatCompletionsUrl: string;
  model: string;
}

export interface AIProviderConfig {
  provider: AIProviderId;
  openai: OpenAIProviderConfig;
}

let loggedProviderConfigOnce = false;

export function getAIProviderConfig(): AIProviderConfig {
  const result: AIProviderConfig = {
    provider: appEnv.aiProvider,
    openai: {
      apiKey: appEnv.openaiApiKey,
      chatCompletionsUrl: appEnv.openaiChatCompletionsUrl,
      model: appEnv.openaiModel,
    },
  };

  if (import.meta.env?.DEV && !loggedProviderConfigOnce) {
    loggedProviderConfigOnce = true;
    const k = result.openai.apiKey;
    console.debug("[ai-provider-config]", {
      provider: result.provider,
      openaiKeyPresent: k != null && k.trim().length > 0,
      openaiKeyLength: k?.trim().length ?? 0,
      chatUrl: result.openai.chatCompletionsUrl,
    });
  }

  return result;
}
