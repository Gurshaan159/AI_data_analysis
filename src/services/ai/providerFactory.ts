import { getAIProviderConfig } from "@/services/ai/config";
import { MockAIProvider } from "@/services/ai/providers/mockProvider";
import { OpenAIProvider } from "@/services/ai/providers/openaiProvider";
import type { AIProvider } from "@/services/ai/types";

export function getAIProvider(): AIProvider {
  const config = getAIProviderConfig();
  if (config.provider === "openai") {
    return new OpenAIProvider(config.openai);
  }
  return new MockAIProvider();
}
