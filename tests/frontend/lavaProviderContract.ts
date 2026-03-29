import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { acceptProviderPlannerResult } from "@/services/ai/planner/resultAcceptance";
import { LavaAIProvider } from "@/services/ai/providers/lavaProvider";

interface ScenarioResult {
  name: string;
  pass: boolean;
  detail: string;
}

function logScenarioResult(result: ScenarioResult): void {
  const status = result.pass ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`${status} | ${result.name} | ${result.detail}`);
}

function mockFetchJson(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

async function runLavaProviderContract(): Promise<void> {
  const availablePipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(availablePipelines);
  const originalFetch = globalThis.fetch;

  const supportedModelJson = {
    kind: "supported",
    chosenPipelineId: "count-matrix-analysis-v1",
    warnings: [],
    assumptions: [],
  };

  globalThis.fetch = mockFetchJson({
    choices: [
      {
        message: {
          role: "assistant",
          content: JSON.stringify(supportedModelJson),
        },
      },
    ],
  });

  const provider = new LavaAIProvider({
    baseUrl: "https://api.lava.so/v1",
    apiKey: "aks_test_placeholder",
    chatCompletionsUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  });

  const result = await provider.recommend({
    availablePipelines,
    functionCatalog,
    userPrompt: "I have a gene count matrix and sample metadata with condition labels and want differential expression.",
  });
  globalThis.fetch = originalFetch;

  const acceptance = acceptProviderPlannerResult(result as unknown, {
    availablePipelines,
    functionCatalog,
    providerLabel: "lava",
  });

  logScenarioResult({
    name: "Lava mocked gateway returns materialized supported result passing acceptance",
    pass:
      result?.kind === "supported" &&
      result.chosenPipelineId === "count-matrix-analysis-v1" &&
      acceptance.accepted,
    detail: `kind=${result?.kind ?? "null"}, accepted=${acceptance.accepted}`,
  });

  // Missing API key
  const providerNoKey = new LavaAIProvider({
    baseUrl: "https://api.lava.so/v1",
    apiKey: null,
    chatCompletionsUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  });
  const noKeyResult = await providerNoKey.recommend({
    availablePipelines,
    functionCatalog,
    userPrompt: "count matrix and metadata for DE",
  });
  logScenarioResult({
    name: "Missing Lava API key returns typed unsupported transport result",
    pass:
      noKeyResult?.kind === "unsupported" &&
      noKeyResult.unsupportedReasonCode === "provider-not-configured",
    detail: `code=${noKeyResult?.kind === "unsupported" ? noKeyResult.unsupportedReasonCode : "n/a"}`,
  });

  const bulkJson = {
    kind: "supported",
    chosenPipelineId: "bulk-rna-matrix-downstream-v1",
    preferTmmLikeNormalization: true,
  };
  globalThis.fetch = mockFetchJson({
    choices: [{ message: { content: JSON.stringify(bulkJson) } }],
  });
  const bulkResult = await provider.recommend({
    availablePipelines,
    functionCatalog,
    userPrompt: "Normalized count matrix with metadata; need PCA and volcano plot for treatment vs control.",
  });
  globalThis.fetch = originalFetch;
  const bulkAcceptance = acceptProviderPlannerResult(bulkResult as unknown, {
    availablePipelines,
    functionCatalog,
    providerLabel: "lava",
  });
  logScenarioResult({
    name: "Lava mocked bulk downstream materialization passes acceptance",
    pass:
      bulkResult?.kind === "supported" &&
      bulkResult.chosenPipelineId === "bulk-rna-matrix-downstream-v1" &&
      bulkAcceptance.accepted,
    detail: `accepted=${bulkAcceptance.accepted}`,
  });

  globalThis.fetch = mockFetchJson({
    choices: [{ message: { content: "{ not-json" } }],
  });
  const badParse = await provider.recommend({
    availablePipelines,
    functionCatalog,
    userPrompt: "count matrix and metadata for DE",
  });
  globalThis.fetch = originalFetch;
  logScenarioResult({
    name: "Malformed assistant JSON yields unsupported transport fallback",
    pass: badParse?.kind === "unsupported" && badParse.unsupportedReasonCode === "provider-request-failed",
    detail: `kind=${badParse?.kind ?? "null"}`,
  });

  const policyBroken = await (async () => {
    globalThis.fetch = mockFetchJson({
      choices: [
        {
          message: {
            content: JSON.stringify({
              kind: "supported",
              chosenPipelineId: "count-matrix-analysis-v1",
            }),
          },
        },
      ],
    });
    const raw = await provider.recommend({
      availablePipelines,
      functionCatalog,
      userPrompt: "matrix",
    });
    globalThis.fetch = originalFetch;
    if (!raw || raw.kind !== "supported") {
      return null;
    }
    const broken = JSON.parse(JSON.stringify(raw)) as typeof raw;
    broken.chosenPipelineId = "bulk-rna-matrix-downstream-v1" as typeof broken.chosenPipelineId;
    return broken;
  })();

  if (policyBroken) {
    const policyAcceptance = acceptProviderPlannerResult(policyBroken as unknown, {
      availablePipelines,
      functionCatalog,
      providerLabel: "lava",
    });
    logScenarioResult({
      name: "Policy-invalid shaped supported result is blocked at acceptance boundary",
      pass: !policyAcceptance.accepted && policyAcceptance.failedStage === "policy",
      detail: `accepted=${policyAcceptance.accepted}`,
    });
  } else {
    logScenarioResult({
      name: "Policy-invalid shaped supported result is blocked at acceptance boundary",
      pass: false,
      detail: "fixture missing",
    });
  }
}

void runLavaProviderContract();
