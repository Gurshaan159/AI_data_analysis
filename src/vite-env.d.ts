/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LAVA_API_BASE_URL?: string;
  readonly VITE_LAVA_API_KEY?: string;
  readonly VITE_LAVA_CHAT_COMPLETIONS_URL?: string;
  readonly VITE_LAVA_MODEL?: string;
  readonly VITE_AI_PROVIDER?: "mock" | "lava";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
