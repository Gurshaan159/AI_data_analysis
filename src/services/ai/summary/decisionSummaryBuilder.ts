import type {
  AIDecisionSummary,
  AIRecommendationResult,
  PipelineDefinition,
  SupportedRecommendationResult,
  SupportedPlannerPipelineId,
  UnsupportedRecommendationResult,
} from "@/shared/types";

function buildPipelineLabelMap(pipelines: PipelineDefinition[]): Map<string, string> {
  return new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.displayName]));
}

function toPipelineLabel(
  pipelineId: SupportedPlannerPipelineId | null,
  pipelineLabels: Map<string, string>,
): string | null {
  if (!pipelineId) {
    return null;
  }
  return pipelineLabels.get(pipelineId) ?? pipelineId;
}

function buildSupportedSummary(
  recommendation: SupportedRecommendationResult,
  pipelineLabels: Map<string, string>,
): AIDecisionSummary {
  const chosenPipelineLabel = toPipelineLabel(recommendation.chosenPipelineId, pipelineLabels) ?? recommendation.chosenPipelineId;
  const keyReasons = recommendation.explanations.slice(0, 3).map((item) => `${item.title}: ${item.detail}`);
  const keyPlannedActions = recommendation.workflowProposal.steps
    .filter((step) => !step.skippedByAi)
    .slice(0, 4)
    .map((step) => `Run ${step.displayLabel}.`);
  const assumptionsToReview = recommendation.assumptions.slice(0, 4);
  const warningsToReview = recommendation.warnings.slice(0, 4);
  const approvalChecklist = [
    `Confirm ${chosenPipelineLabel} matches your analysis goal.`,
    "Confirm matrix and metadata inputs are ready and correctly labeled.",
    "Review AI-modified, added, or skipped workflow steps before approval.",
  ];
  if (warningsToReview.length > 0) {
    approvalChecklist.push("Review warnings and resolve anything uncertain before running.");
  }

  return {
    kind: "supported",
    title: "AI Recommendation Summary",
    recommendationSummary: `AI selected ${chosenPipelineLabel} within bounded v1 workflows.`,
    chosenPipelineLabel,
    keyReasons,
    keyPlannedActions,
    assumptionsToReview,
    warningsToReview,
    approvalChecklist,
  };
}

function buildUnsupportedSummary(
  recommendation: UnsupportedRecommendationResult,
  pipelineLabels: Map<string, string>,
): AIDecisionSummary {
  const closestSupportedWorkflowLabel = toPipelineLabel(recommendation.closestSupportedPipelineId, pipelineLabels);
  const nextStepSuggestions = [
    "Reframe your request to matrix-first count or bulk-RNA matrix downstream analysis.",
    closestSupportedWorkflowLabel
      ? `Try the closest supported workflow: ${closestSupportedWorkflowLabel}.`
      : "Try one of the currently supported matrix-first workflows.",
    "Include matrix and metadata context so the planner can map your intent deterministically.",
  ];

  return {
    kind: "unsupported",
    title: "Unsupported Request Summary",
    unsupportedSummary: recommendation.summary,
    unsupportedReasonDetail: recommendation.reason,
    closestSupportedWorkflowLabel,
    nextStepSuggestions,
    fallbackResources: recommendation.suggestedResources.map((item) => ({
      title: item.title,
      description: item.description,
      url: item.url,
      citation: item.citation,
    })),
  };
}

export function buildAiDecisionSummary(
  recommendation: AIRecommendationResult,
  pipelines: PipelineDefinition[],
): AIDecisionSummary {
  const pipelineLabels = buildPipelineLabelMap(pipelines);
  if (recommendation.kind === "supported") {
    return buildSupportedSummary(recommendation, pipelineLabels);
  }
  return buildUnsupportedSummary(recommendation, pipelineLabels);
}
