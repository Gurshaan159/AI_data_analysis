/**
 * OpenAI-style chat message content may be string or structured (multimodal).
 */
export function textFromAssistantContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "object" && part !== null && "text" in part && typeof (part as { text: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  }
  return "";
}

/**
 * Strips optional ```json fences from model output.
 */
export function extractJsonTextFromAssistantMessage(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  return trimmed;
}

export function parseUnknownJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}
