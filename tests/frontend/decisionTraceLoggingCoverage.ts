import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import type { PlannerDecisionTrace } from "@/services/ai/planner/decisionTraceLogger";

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

function runAll() {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);

  const originalDebug = console.debug;
  const previousTraceEnv = typeof process !== "undefined" ? process.env.AI_DECISION_TRACE : undefined;
  const captured: PlannerDecisionTrace[] = [];
  if (typeof process !== "undefined") {
    process.env.AI_DECISION_TRACE = "1";
  }
  console.debug = (message?: unknown, trace?: unknown) => {
    if (message === "ai.planner.decision_trace" && trace && typeof trace === "object") {
      captured.push(trace as PlannerDecisionTrace);
    }
  };

  try {
    const countResult = planWithBoundedCatalog({
      userPrompt: "I have a count matrix and metadata, and I want differential expression from condition groups.",
      availablePipelines: pipelines,
      functionCatalog,
      providerLabel: "mock",
    });
    const bulkResult = planWithBoundedCatalog({
      userPrompt: "Bulk RNA matrix with metadata and treatment/control groups; include PCA and volcano plot.",
      availablePipelines: pipelines,
      functionCatalog,
      providerLabel: "mock",
    });
    const unsupportedResult = planWithBoundedCatalog({
      userPrompt: "Need single-cell clustering and marker genes from droplet data.",
      availablePipelines: pipelines,
      functionCatalog,
      providerLabel: "mock",
    });

    const countTrace = captured.find((trace) => trace.plannerDecision.chosenPipelineId === "count-matrix-analysis-v1");
    const bulkTrace = captured.find((trace) => trace.plannerDecision.chosenPipelineId === "bulk-rna-matrix-downstream-v1");
    const unsupportedTrace = captured.find((trace) => trace.recommendationKind === "unsupported");

    const results: ScenarioResult[] = [
      {
        name: "Supported count-matrix recommendation emits structured decision trace",
        pass:
          Boolean(countResult && countResult.kind === "supported") &&
          Boolean(countTrace) &&
          Boolean(countTrace?.selectedFunctionCalls.length) &&
          Boolean(countTrace?.approvalHandoff?.selectedPipelineId === "count-matrix-analysis-v1"),
        detail: countTrace ? `functions=${countTrace.selectedFunctionCalls.length}` : "missing trace",
      },
      {
        name: "Supported bulk recommendation emits structured decision trace",
        pass:
          Boolean(bulkResult && bulkResult.kind === "supported") &&
          Boolean(bulkTrace) &&
          Boolean(bulkTrace?.selectedFunctionCalls.length) &&
          Boolean(bulkTrace?.plannerDecision.chosenPipelineId === "bulk-rna-matrix-downstream-v1"),
        detail: bulkTrace ? `functions=${bulkTrace.selectedFunctionCalls.length}` : "missing trace",
      },
      {
        name: "Unsupported recommendation emits trace with unsupported reason",
        pass:
          Boolean(unsupportedResult && unsupportedResult.kind === "unsupported") &&
          Boolean(unsupportedTrace) &&
          Boolean(unsupportedTrace?.plannerDecision.unsupportedReasonCode) &&
          unsupportedTrace?.approvalHandoff === null,
        detail: unsupportedTrace?.plannerDecision.unsupportedReasonCode ?? "missing trace",
      },
      {
        name: "Trace payload remains concise and summary-oriented",
        pass:
          captured.length >= 3 &&
          captured.every(
            (trace) =>
              !("workflowProposal" in (trace as unknown as Record<string, unknown>)) &&
              !("suggestedWorkflow" in (trace as unknown as Record<string, unknown>)) &&
              !("userPrompt" in (trace as unknown as Record<string, unknown>)),
          ),
        detail: `captured=${captured.length}`,
      },
    ];

    results.forEach(logScenarioResult);
    const failed = results.filter((result) => !result.pass);
    if (failed.length > 0) {
      throw new Error(`FAILED SCENARIOS: ${failed.length}/${results.length}`);
    }
    // eslint-disable-next-line no-console
    console.log(`ALL SCENARIOS PASSED: ${results.length}/${results.length}`);
  } finally {
    console.debug = originalDebug;
    if (typeof process !== "undefined") {
      if (previousTraceEnv === undefined) {
        delete process.env.AI_DECISION_TRACE;
      } else {
        process.env.AI_DECISION_TRACE = previousTraceEnv;
      }
    }
  }
}

runAll();
