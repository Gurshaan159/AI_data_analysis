/** Prints whether OpenAI key + provider wiring match (no secrets). Run: npm exec tsx tests/verifyProvider.ts */
import "./loadDotenv";
import { appEnv } from "@/config/env";
import { getAIProvider } from "@/services/ai/providerFactory";

const provider = getAIProvider();
const fromOpenAiName = Boolean(process.env.VITE_OPENAI_API_KEY?.trim());
const fromLegacyLavaName = Boolean(process.env.VITE_LAVA_API_KEY?.trim());
// eslint-disable-next-line no-console
console.log(
  JSON.stringify({
    hasKey: Boolean(appEnv.openaiApiKey && appEnv.openaiApiKey.length > 0),
    envHasOpenAiNamed: fromOpenAiName,
    envHasLegacyLavaNamedKey: fromLegacyLavaName,
    configuredProvider: appEnv.aiProvider,
    selectedProviderId: provider.id,
    wiringOk: appEnv.aiProvider === provider.id,
  }),
);
