import type {
  ApprovedAiWorkflowHandoff,
  PlannerApprovalContext,
  SupportedRecommendationResult,
} from "@/shared/types";

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

function buildPlannerApprovalContext(recommendation: SupportedRecommendationResult): PlannerApprovalContext {
  return {
    recommendationId: recommendation.recommendationId,
    plannerFunctionCalls: recommendation.plannerFunctionCalls,
    explanations: recommendation.explanations,
    addedSteps: recommendation.addedSteps,
    modifiedSteps: recommendation.modifiedSteps,
    skippedSteps: recommendation.skippedSteps,
    changedParameters: recommendation.changedParameters,
    warnings: recommendation.warnings,
    assumptions: recommendation.assumptions,
  };
}

export function buildApprovedAiWorkflowHandoff(
  recommendation: SupportedRecommendationResult,
): { ok: true; value: ApprovedAiWorkflowHandoff } | { ok: false; error: string } {
  const handoff = recommendation.approvalHandoff;
  if (!handoff) {
    return { ok: false, error: "Accepted planner result is missing approval handoff data." };
  }
  if (handoff.selectedPipelineId !== recommendation.chosenPipelineId) {
    return { ok: false, error: "Approval handoff pipeline does not match chosen pipeline." };
  }
  if (handoff.proposedWorkflow.pipelineId !== recommendation.chosenPipelineId) {
    return { ok: false, error: "Approval handoff workflow pipeline does not match chosen pipeline." };
  }
  if (!isStringRecord(handoff.selectedModifications)) {
    return { ok: false, error: "Approval handoff selected modifications are missing or malformed." };
  }

  const normalizedWorkflow = {
    ...handoff.proposedWorkflow,
    selectedModifications: { ...handoff.selectedModifications },
    warnings: Array.from(new Set([...(handoff.proposedWorkflow.warnings ?? []), ...recommendation.warnings])),
  };

  return {
    ok: true,
    value: {
      selectedPipelineId: handoff.selectedPipelineId,
      selectedModifications: { ...handoff.selectedModifications },
      workflow: normalizedWorkflow,
      plannerContext: buildPlannerApprovalContext(recommendation),
    },
  };
}
