import { getAIProviderConfig } from "@/services/ai/config";
import { LavaAIProvider } from "@/services/ai/providers/lavaProvider";
import { MockAIProvider } from "@/services/ai/providers/mockProvider";
import type { AIProvider } from "@/services/ai/types";

export function getAIProvider(): AIProvider {
  const config = getAIProviderConfig();
  if (config.provider === "lava") {
    return new LavaAIProvider(config.lava);
  }
  return new MockAIProvider(config.provider);
}
