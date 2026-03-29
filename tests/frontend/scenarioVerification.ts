import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { acceptProviderPlannerResult } from "@/services/ai/planner/resultAcceptance";
import { recommendWorkflow } from "@/services/ai/recommendationService";

interface ScenarioResult {
  name: string;
  pass: boolean;
  detail: string;
}

function logScenarioResult(result: ScenarioResult) {
  const status = result.pass ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`${status} | ${result.name} | ${result.detail}`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function runVerificationScenarios() {
  const availablePipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(availablePipelines);

  const supportedRecommendation = await recommendWorkflow({
    availablePipelines,
    functionCatalog,
    userPrompt: "I have a count matrix and metadata, and I want differential expression from condition groups.",
  });
  const scenario1Acceptance = acceptProviderPlannerResult(supportedRecommendation as unknown, {
    availablePipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  const scenario1 =
    supportedRecommendation?.kind === "supported" &&
    supportedRecommendation.chosenPipelineId === "count-matrix-analysis-v1" &&
    scenario1Acceptance.accepted;
  logScenarioResult({
    name: "Scenario1 valid supported result passes runtime+policy validation",
    pass: scenario1,
    detail:
      supportedRecommendation?.kind === "supported"
        ? `pipeline=${supportedRecommendation.chosenPipelineId}, accepted=${scenario1Acceptance.accepted}`
        : `kind=${supportedRecommendation?.kind ?? "null"}`,
  });

  const unsupportedRecommendation = await recommendWorkflow({
    availablePipelines,
    functionCatalog,
    userPrompt: "Need single-cell clustering and marker genes from droplet data.",
  });
  const scenario2Acceptance = acceptProviderPlannerResult(unsupportedRecommendation as unknown, {
    availablePipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  const scenario2 =
    unsupportedRecommendation?.kind === "unsupported" &&
    Boolean(unsupportedRecommendation.summary) &&
    scenario2Acceptance.accepted;
  logScenarioResult({
    name: "Scenario2 valid unsupported result passes runtime+policy validation",
    pass: scenario2,
    detail:
      unsupportedRecommendation?.kind === "unsupported"
        ? `reason=${unsupportedRecommendation.unsupportedReasonCode}, accepted=${scenario2Acceptance.accepted}`
        : `kind=${unsupportedRecommendation?.kind ?? "null"}`,
  });

  const malformedProviderResult = {
    kind: "supported",
    recommendationId: "broken-shape",
    chosenPipelineId: "count-matrix-analysis-v1",
  };
  const malformedAcceptance = acceptProviderPlannerResult(malformedProviderResult, {
    availablePipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  const scenario3 =
    !malformedAcceptance.accepted &&
    malformedAcceptance.failedStage === "runtime-schema" &&
    malformedAcceptance.result.unsupportedReasonCode === "invalid-provider-output-shape";
  logScenarioResult({
    name: "Scenario3 malformed provider result fails runtime validation",
    pass: scenario3,
    detail: `accepted=${malformedAcceptance.accepted}, stage=${
      malformedAcceptance.accepted ? "none" : malformedAcceptance.failedStage
    }`,
  });

  const policyInvalid =
    supportedRecommendation?.kind === "supported" ? clone(supportedRecommendation) : null;
  if (policyInvalid && policyInvalid.kind === "supported") {
    policyInvalid.chosenPipelineId = "scrna-seq-v1" as unknown as "count-matrix-analysis-v1";
    policyInvalid.workflowProposal.pipelineId = "scrna-seq-v1" as unknown as never;
    policyInvalid.suggestedWorkflow.pipelineId = "scrna-seq-v1" as unknown as never;
    policyInvalid.approvalHandoff.selectedPipelineId = "scrna-seq-v1" as unknown as "count-matrix-analysis-v1";
    policyInvalid.approvalHandoff.proposedWorkflow.pipelineId = "scrna-seq-v1" as unknown as never;
  }
  const policyInvalidAcceptance = acceptProviderPlannerResult(policyInvalid as unknown, {
    availablePipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  const scenario4 =
    !policyInvalidAcceptance.accepted &&
    policyInvalidAcceptance.failedStage === "policy" &&
    policyInvalidAcceptance.result.unsupportedReasonCode === "planner-policy-violation";
  logScenarioResult({
    name: "Scenario4 structurally valid but policy-invalid result is blocked",
    pass: scenario4,
    detail: `accepted=${policyInvalidAcceptance.accepted}, stage=${
      policyInvalidAcceptance.accepted ? "none" : policyInvalidAcceptance.failedStage
    }`,
  });

  const unknownPipeline =
    supportedRecommendation?.kind === "supported" ? clone(supportedRecommendation) : null;
  if (unknownPipeline && unknownPipeline.kind === "supported") {
    unknownPipeline.chosenPipelineId = "unknown-pipeline-v1" as unknown as "count-matrix-analysis-v1";
    unknownPipeline.workflowProposal.pipelineId = "unknown-pipeline-v1" as unknown as never;
    unknownPipeline.suggestedWorkflow.pipelineId = "unknown-pipeline-v1" as unknown as never;
    unknownPipeline.approvalHandoff.selectedPipelineId = "unknown-pipeline-v1" as unknown as "count-matrix-analysis-v1";
    unknownPipeline.approvalHandoff.proposedWorkflow.pipelineId = "unknown-pipeline-v1" as unknown as never;
  }
  const unknownPipelineAcceptance = acceptProviderPlannerResult(unknownPipeline as unknown, {
    availablePipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  const scenario5 =
    !unknownPipelineAcceptance.accepted &&
    unknownPipelineAcceptance.failedStage === "runtime-schema" &&
    unknownPipelineAcceptance.result.unsupportedReasonCode === "invalid-provider-output-shape";
  logScenarioResult({
    name: "Scenario5 supported result with unknown pipeline is rejected",
    pass: scenario5,
    detail: `accepted=${unknownPipelineAcceptance.accepted}, stage=${
      unknownPipelineAcceptance.accepted ? "none" : unknownPipelineAcceptance.failedStage
    }`,
  });

  const disallowedFunctionResult =
    supportedRecommendation?.kind === "supported" ? clone(supportedRecommendation) : null;
  if (disallowedFunctionResult && disallowedFunctionResult.kind === "supported") {
    disallowedFunctionResult.plannerFunctionCalls.push(
      {
        functionId: "totally_disallowed_function",
        arguments: {},
      } as unknown as (typeof disallowedFunctionResult.plannerFunctionCalls)[number],
    );
  }
  const disallowedFunctionAcceptance = acceptProviderPlannerResult(disallowedFunctionResult as unknown, {
    availablePipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  const scenario6 = !disallowedFunctionAcceptance.accepted && disallowedFunctionAcceptance.failedStage === "policy";
  logScenarioResult({
    name: "Scenario6 supported result with disallowed function IDs is rejected",
    pass: scenario6,
    detail: `accepted=${disallowedFunctionAcceptance.accepted}, stage=${
      disallowedFunctionAcceptance.accepted ? "none" : disallowedFunctionAcceptance.failedStage
    }`,
  });

  const scenario7Recommendation = await recommendWorkflow({
    availablePipelines,
    functionCatalog,
    userPrompt: "Bulk RNA matrix with metadata and treatment/control groups; include PCA and DE.",
  });
  const pageDecoupled =
    scenario7Recommendation !== null &&
    !("accepted" in (scenario7Recommendation as unknown as Record<string, unknown>)) &&
    !("failedStage" in (scenario7Recommendation as unknown as Record<string, unknown>)) &&
    !("issues" in (scenario7Recommendation as unknown as Record<string, unknown>));
  logScenarioResult({
    name: "Scenario7 AI-assisted page remains decoupled from planner/provider internals",
    pass: pageDecoupled,
    detail: `shapeStable=${pageDecoupled}, kind=${scenario7Recommendation?.kind ?? "null"}`,
  });

  const lavaStyleUnsupported = {
    kind: "unsupported",
    recommendationId: "lava-future-1",
    unsupportedReasonCode: "outside-supported-universe",
    summary: "Lava future output fallback",
    reason: "Lava provider intentionally returned bounded unsupported response.",
    closestSupportedPipelineId: null,
    plannerFunctionCalls: [
      {
        functionId: "detect_unsupported_request",
        arguments: {
          reasonCode: "outside-supported-universe",
          reason: "External provider fallback",
        },
      },
    ],
    explanations: [
      {
        id: "lava-explain",
        kind: "fallback",
        title: "Lava fallback",
        detail: "Structured unsupported response from future lava provider.",
        sourceFunctionId: "detect_unsupported_request",
      },
    ],
    warnings: [],
    assumptions: [],
    suggestedResources: [
      {
        id: "lava-note",
        title: "Lava note",
        description: "Valid unsupported payload shape.",
        resourceType: "placeholder",
      },
    ],
  };
  const lavaAcceptance = acceptProviderPlannerResult(lavaStyleUnsupported, {
    availablePipelines,
    functionCatalog,
    providerLabel: "lava",
  });
  logScenarioResult({
    name: "Scenario8 future lava-style provider payload passes same validated boundary",
    pass: lavaAcceptance.accepted && lavaAcceptance.result?.kind === "unsupported",
    detail: `accepted=${lavaAcceptance.accepted}, kind=${lavaAcceptance.result?.kind ?? "null"}`,
  });
}

void runVerificationScenarios();
