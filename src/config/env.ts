const DEFAULT_LAVA_API_BASE_URL = "http://localhost:3000";

export interface AppEnv {
  lavaApiBaseUrl: string;
  lavaApiKey: string | null;
  aiProvider: "mock" | "lava";
}

function normalizeProvider(value: string | undefined): AppEnv["aiProvider"] {
  if (value === "lava" || value === "mock") {
    return value;
  }
  return "mock";
}

function readEnv(name: "VITE_LAVA_API_BASE_URL" | "VITE_LAVA_API_KEY" | "VITE_AI_PROVIDER"): string | undefined {
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
  aiProvider: normalizeProvider(readEnv("VITE_AI_PROVIDER")),
};
