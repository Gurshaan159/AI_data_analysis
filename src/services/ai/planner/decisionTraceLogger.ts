import { summarizeIntentSignals } from "@/services/ai/intent/intentTypes";
import type { AIRecommendationResult, PlannerIntentSignals } from "@/shared/types";

export interface PlannerDecisionTrace {
  event: "ai.planner.decision_trace";
  providerLabel: string;
  recommendationId: string;
  recommendationKind: "supported" | "unsupported";
  intentSignals: {
    summary: string[];
    unsupportedAnalysisRequested: boolean;
    ambiguousInputDescription: boolean;
    expectsGroupComparison: boolean;
    expectsDimensionalityReduction: boolean;
  };
  plannerDecision: {
    chosenPipelineId: string | null;
    unsupportedReasonCode: string | null;
    closestSupportedPipelineId: string | null;
  };
  selectedFunctionCalls: string[];
  proposedModifications: {
    addedStepIds: string[];
    modifiedStepIds: string[];
    skippedStepIds: string[];
    changedParameterKeys: string[];
  };
  assumptions: string[];
  warnings: string[];
  approvalHandoff: {
    selectedPipelineId: string;
    selectedModificationKeys: string[];
    requiredUserActions: string[];
  } | null;
}

function shouldEmitDecisionTrace(): boolean {
  if (typeof process !== "undefined" && process.env?.AI_DECISION_TRACE === "0") {
    return false;
  }
  return true;
}

function toSupportedTrace(result: Extract<AIRecommendationResult, { kind: "supported" }>): PlannerDecisionTrace["plannerDecision"] {
  return {
    chosenPipelineId: result.chosenPipelineId,
    unsupportedReasonCode: null,
    closestSupportedPipelineId: null,
  };
}

function toUnsupportedTrace(
  result: Extract<AIRecommendationResult, { kind: "unsupported" }>,
): PlannerDecisionTrace["plannerDecision"] {
  return {
    chosenPipelineId: null,
    unsupportedReasonCode: result.unsupportedReasonCode,
    closestSupportedPipelineId: result.closestSupportedPipelineId,
  };
}

export function buildPlannerDecisionTrace(args: {
  providerLabel: string;
  intent: PlannerIntentSignals;
  result: AIRecommendationResult;
}): PlannerDecisionTrace {
  const { providerLabel, intent, result } = args;
  return {
    event: "ai.planner.decision_trace",
    providerLabel,
    recommendationId: result.recommendationId,
    recommendationKind: result.kind,
    intentSignals: {
      summary: summarizeIntentSignals(intent).slice(0, 4),
      unsupportedAnalysisRequested: intent.constraints.unsupportedAnalysisRequested,
      ambiguousInputDescription: intent.constraints.ambiguousInputDescription,
      expectsGroupComparison: intent.dataCharacteristics.expectsGroupComparison,
      expectsDimensionalityReduction: intent.dataCharacteristics.expectsDimensionalityReduction,
    },
    plannerDecision: result.kind === "supported" ? toSupportedTrace(result) : toUnsupportedTrace(result),
    selectedFunctionCalls: result.plannerFunctionCalls.map((call) => call.functionId),
    proposedModifications:
      result.kind === "supported"
        ? {
            addedStepIds: result.addedSteps.map((step) => step.stepId),
            modifiedStepIds: result.modifiedSteps.map((step) => step.stepId),
            skippedStepIds: result.skippedSteps.map((step) => step.stepId),
            changedParameterKeys: result.changedParameters.map((change) => change.parameterKey),
          }
        : {
            addedStepIds: [],
            modifiedStepIds: [],
            skippedStepIds: [],
            changedParameterKeys: [],
          },
    assumptions: result.assumptions.slice(0, 4),
    warnings: result.warnings.slice(0, 4),
    approvalHandoff:
      result.kind === "supported"
        ? {
            selectedPipelineId: result.approvalHandoff.selectedPipelineId,
            selectedModificationKeys: Object.keys(result.approvalHandoff.selectedModifications),
            requiredUserActions: result.approvalHandoff.requiredUserActions.slice(0, 3),
          }
        : null,
  };
}

export function logPlannerDecisionTrace(args: {
  providerLabel: string;
  intent: PlannerIntentSignals;
  result: AIRecommendationResult;
}): void {
  if (!shouldEmitDecisionTrace()) {
    return;
  }
  const trace = buildPlannerDecisionTrace(args);
  // One stable event key keeps planner traces easy to filter in dev tools.
  console.debug("ai.planner.decision_trace", trace);
}
