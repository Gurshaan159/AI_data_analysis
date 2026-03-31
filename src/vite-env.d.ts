/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_CHAT_COMPLETIONS_URL?: string;
  readonly VITE_OPENAI_MODEL?: string;
  /** @deprecated Legacy name — same as `VITE_OPENAI_API_KEY` (direct OpenAI, not the old gateway). */
  readonly VITE_LAVA_API_KEY?: string;
  readonly VITE_LAVA_CHAT_COMPLETIONS_URL?: string;
  readonly VITE_LAVA_MODEL?: string;
  readonly VITE_AI_PROVIDER?: "mock" | "openai" | "lava";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
