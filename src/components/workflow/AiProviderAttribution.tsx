import { getAIProvider } from "@/services/ai/providerFactory";

export function AiProviderAttribution() {
  const providerId = getAIProvider().id;
  const label = providerId === "openai" ? "OpenAI" : "Mock";
  return (
    <p className="ai-provider-attribution" role="status">
      AI response · {label}
    </p>
  );
}
