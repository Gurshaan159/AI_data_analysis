import { appEnv } from "@/config/env";
import { getAIProvider } from "@/services/ai/providerFactory";

const provider = getAIProvider();

// eslint-disable-next-line no-console
console.log(`configured=${appEnv.aiProvider} selected=${provider.id}`);
