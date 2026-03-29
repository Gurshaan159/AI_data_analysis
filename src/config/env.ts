/** Lava gateway base URL (see https://lava.so/docs — forward requests use POST /v1/forward). */
const DEFAULT_LAVA_API_BASE_URL = "https://api.lava.so/v1";
const DEFAULT_LAVA_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_LAVA_MODEL = "gpt-4o-mini";

export interface AppEnv {
  lavaApiBaseUrl: string;
  lavaApiKey: string | null;
  /** Forward target for chat completions (OpenAI-compatible). */
  lavaChatCompletionsUrl: string;
  lavaModel: string;
  aiProvider: "mock" | "lava";
}

function normalizeProvider(value: string | undefined): AppEnv["aiProvider"] {
  if (value === "lava" || value === "mock") {
    return value;
  }
  return "mock";
}

function readEnv(name: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  if (viteEnv && typeof viteEnv[name] === "string") {
    return viteEnv[name];
  }
  const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (maybeProcess?.env) {
    return maybeProcess.env[name];
  }
  return undefined;
}

export const appEnv: AppEnv = {
  lavaApiBaseUrl: readEnv("VITE_LAVA_API_BASE_URL") ?? DEFAULT_LAVA_API_BASE_URL,
  lavaApiKey: readEnv("VITE_LAVA_API_KEY") ?? null,
  lavaChatCompletionsUrl: readEnv("VITE_LAVA_CHAT_COMPLETIONS_URL") ?? DEFAULT_LAVA_CHAT_COMPLETIONS_URL,
  lavaModel: readEnv("VITE_LAVA_MODEL") ?? DEFAULT_LAVA_MODEL,
  aiProvider: normalizeProvider(readEnv("VITE_AI_PROVIDER")),
};
