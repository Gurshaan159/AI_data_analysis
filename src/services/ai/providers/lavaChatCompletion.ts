import type { LavaProviderConfig } from "@/services/ai/config";
import { extractJsonTextFromAssistantMessage, parseUnknownJson, textFromAssistantContent } from "@/services/ai/providers/lavaMessageParser";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface LavaChatCompletionConfig {
  /** Lava API base, e.g. https://api.lava.so/v1 */
  apiBaseUrl: string;
  /** Lava merchant secret key (aks_live_...) */
  apiKey: string;
  /** Upstream OpenAI-compatible chat completions URL (forward target). */
  chatCompletionsUrl: string;
  model: string;
}

export type LavaChatCompletionResult =
  | { ok: true; rawJson: unknown }
  | { ok: false; errorMessage: string; status?: number };

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/$/, "");
}

/**
 * POST ${apiBaseUrl}/forward?u=<encoded upstream chat completions URL>
 * Authorization: Bearer <Lava secret key>
 */
export async function requestLavaChatCompletionJson(args: {
  config: LavaChatCompletionConfig;
  systemPrompt: string;
  userPrompt: string;
}): Promise<LavaChatCompletionResult> {
  const { config } = args;
  const forwardUrl = `${normalizeBaseUrl(config.apiBaseUrl)}/forward?u=${encodeURIComponent(config.chatCompletionsUrl)}`;
  const body = {
    model: config.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  };

  let response: Response;
  try {
    response = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
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
      errorMessage: "Lava response was not valid JSON.",
    };
  }

  if (!response.ok) {
    const errMsg =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : `Lava gateway error (${response.status})`;
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
      errorMessage: "Lava response missing assistant message content.",
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

export function lavaChatConfigFromEnv(config: LavaProviderConfig, overrides: { chatCompletionsUrl: string; model: string }): LavaChatCompletionConfig {
  return {
    apiBaseUrl: config.baseUrl,
    apiKey: config.apiKey ?? "",
    chatCompletionsUrl: overrides.chatCompletionsUrl,
    model: overrides.model,
  };
}
