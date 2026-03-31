const DEFAULT_OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export interface AppEnv {
  openaiApiKey: string | null;
  /** OpenAI-compatible chat completions URL (OpenAI, Azure OpenAI, etc.). */
  openaiChatCompletionsUrl: string;
  openaiModel: string;
  aiProvider: "mock" | "openai";
}

/** Explicit `mock` / `openai` wins; `lava` is treated as `openai` for old `.env` files. Otherwise use OpenAI when a key is set. */
function normalizeProvider(providerRaw: string | undefined, hasOpenAiApiKey: boolean): AppEnv["aiProvider"] {
  const trimmed = providerRaw?.trim();
  if (trimmed === "mock") {
    return "mock";
  }
  if (trimmed === "openai" || trimmed === "lava") {
    return hasOpenAiApiKey ? "openai" : "mock";
  }
  if (hasOpenAiApiKey) {
    return "openai";
  }
  return "mock";
}

/** Non-empty string from env, or undefined (empty string counts as unset). */
function pickEnvValue(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Node/tsx tests: `dotenv` fills `process.env`. The browser bundle has no `process`. */
function pickProcessEnv(key: string): string | undefined {
  const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return pickEnvValue(maybeProcess?.env?.[key]);
}

/**
 * Vite only replaces **static** `import.meta.env.VITE_*` references in client code.
 * Dynamic access (`import.meta.env[name]`) is not populated, so the app always behaved as if
 * no key was set. Merge with `process.env` for Node/tsx tests that preload `.env`.
 * @see https://vite.dev/guide/env-and-mode
 */
function mergeViteAndProcess(viteValue: string | undefined, processKey: string): string | undefined {
  return pickEnvValue(viteValue) ?? pickProcessEnv(processKey);
}

const openaiApiKeyRaw =
  mergeViteAndProcess(import.meta.env?.VITE_OPENAI_API_KEY, "VITE_OPENAI_API_KEY") ??
  mergeViteAndProcess(import.meta.env?.VITE_LAVA_API_KEY, "VITE_LAVA_API_KEY");
const openaiApiKey =
  typeof openaiApiKeyRaw === "string" && openaiApiKeyRaw.trim().length > 0 ? openaiApiKeyRaw.trim() : null;

const openaiChatCompletionsUrlResolved =
  mergeViteAndProcess(import.meta.env?.VITE_OPENAI_CHAT_COMPLETIONS_URL, "VITE_OPENAI_CHAT_COMPLETIONS_URL") ??
  mergeViteAndProcess(import.meta.env?.VITE_LAVA_CHAT_COMPLETIONS_URL, "VITE_LAVA_CHAT_COMPLETIONS_URL") ??
  DEFAULT_OPENAI_CHAT_COMPLETIONS_URL;

const openaiModelResolved =
  mergeViteAndProcess(import.meta.env?.VITE_OPENAI_MODEL, "VITE_OPENAI_MODEL") ??
  mergeViteAndProcess(import.meta.env?.VITE_LAVA_MODEL, "VITE_LAVA_MODEL") ??
  DEFAULT_OPENAI_MODEL;

export const appEnv: AppEnv = {
  openaiApiKey,
  openaiChatCompletionsUrl: openaiChatCompletionsUrlResolved,
  openaiModel: openaiModelResolved,
  aiProvider: normalizeProvider(
    mergeViteAndProcess(import.meta.env?.VITE_AI_PROVIDER, "VITE_AI_PROVIDER"),
    openaiApiKey !== null,
  ),
};

if (import.meta.env?.DEV && appEnv.openaiApiKey === null && appEnv.aiProvider === "mock") {
  console.info(
    "[env] AI provider is Mock: set VITE_OPENAI_API_KEY (or legacy VITE_LAVA_API_KEY) in the project root .env, same line with no spaces around =, then restart the dev server.",
  );
}
