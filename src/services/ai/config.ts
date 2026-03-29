import { appEnv } from "@/config/env";

export type AIProviderId = "mock" | "lava";

export interface LavaProviderConfig {
  baseUrl: string;
  apiKey: string | null;
}

export interface AIProviderConfig {
  provider: AIProviderId;
  lava: LavaProviderConfig;
}

export function getAIProviderConfig(): AIProviderConfig {
  return {
    provider: appEnv.aiProvider,
    lava: {
      baseUrl: appEnv.lavaApiBaseUrl,
      apiKey: appEnv.lavaApiKey,
    },
  };
}
