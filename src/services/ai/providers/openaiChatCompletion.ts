import { extractJsonTextFromAssistantMessage, parseUnknownJson, textFromAssistantContent } from "@/services/ai/providers/lavaMessageParser";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface OpenAiChatCompletionConfig {
  apiKey: string;
  chatCompletionsUrl: string;
  model: string;
}

export type OpenAiChatCompletionResult =
  | { ok: true; rawJson: unknown }
  | { ok: false; errorMessage: string; status?: number };

let cachedTauriHttpFetch: typeof fetch | undefined;

/** Tauri WebView enforces browser CORS on `globalThis.fetch`; plugin-http runs via Rust and avoids that. */
async function getHttpFetch(): Promise<typeof fetch> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    if (!cachedTauriHttpFetch) {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      cachedTauriHttpFetch = tauriFetch;
    }
    return cachedTauriHttpFetch;
  }
  return globalThis.fetch.bind(globalThis);
}

/** POST OpenAI-compatible chat completions; parses assistant JSON object output. */
export async function requestOpenAiChatCompletionJson(args: {
  config: OpenAiChatCompletionConfig;
  systemPrompt: string;
  userPrompt: string;
}): Promise<OpenAiChatCompletionResult> {
  const { config } = args;
  const url = config.chatCompletionsUrl.replace(/\/$/, "");
  const body = {
    model: config.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  };

  const httpFetch = await getHttpFetch();
  let response: Response;
  try {
    response = await httpFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      status: response.status,
      errorMessage: "OpenAI response was not valid JSON.",
    };
  }

  if (!response.ok) {
    const errMsg =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : `OpenAI API error (${response.status})`;
    return {
      ok: false,
      status: response.status,
      errorMessage: errMsg,
    };
  }

  const content = extractAssistantContent(payload);
  if (!content) {
    return {
      ok: false,
      status: response.status,
      errorMessage: "OpenAI response missing assistant message content.",
    };
  }

  const jsonText = extractJsonTextFromAssistantMessage(content);
  try {
    const rawJson = parseUnknownJson(jsonText);
    return { ok: true, rawJson };
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      errorMessage: error instanceof Error ? error.message : "Failed to parse model JSON.",
    };
  }
}

function extractAssistantContent(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const data: unknown = payload.data;
  const root: Record<string, unknown> = isRecord(data) ? data : payload;
  const choices: unknown = root.choices;
  if (!Array.isArray(choices) || !choices.length) {
    return null;
  }
  const first: unknown = choices[0];
  if (!isRecord(first)) {
    return null;
  }
  const message = first.message;
  if (!isRecord(message)) {
    return null;
  }
  const text = textFromAssistantContent(message.content);
  return text.trim() ? text : null;
}
