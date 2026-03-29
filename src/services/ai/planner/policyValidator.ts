import { getSupportedPlannerPipelineIds } from "@/services/ai/planner/functionCatalog";
import type {
  AIRecommendationResult,
  PipelineDefinition,
  PlannerFunctionCatalogEntry,
  SupportedRecommendationResult,
  SupportedPlannerPipelineId,
  UnsupportedRecommendationResult,
  WorkflowStep,
} from "@/shared/types";
import type { PlannerValidationIssue, PlannerValidationResult } from "@/services/ai/planner/validationTypes";

interface PolicyValidationContext {
  availablePipelines: PipelineDefinition[];
  functionCatalog: PlannerFunctionCatalogEntry[];
}

function pushIssue(issues: PlannerValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ stage: "policy", code, path, message });
}

function isAllowedForPipeline(entry: PlannerFunctionCatalogEntry, pipelineId: SupportedPlannerPipelineId): boolean {
  if (entry.allowedPipelineIds === "all") {
    return true;
  }
  return entry.allowedPipelineIds.includes(pipelineId);
}

function validateSelectedModifications(
  selected: Record<string, string>,
  pipeline: PipelineDefinition,
  pathPrefix: string,
  issues: PlannerValidationIssue[],
): void {
  const slotMap = new Map(pipeline.modificationSlots.map((slot) => [slot.id, slot]));
  Object.entries(selected).forEach(([slotId, optionId]) => {
    const slot = slotMap.get(slotId);
    if (!slot) {
      pushIssue(issues, "unknown-modification-slot", `${pathPrefix}.${slotId}`, "Unknown modification slot for chosen pipeline.");
      return;
    }
    if (!slot.supportedOptions.some((option) => option.id === optionId)) {
      pushIssue(
        issues,
        "invalid-modification-option",
        `${pathPrefix}.${slotId}`,
        "Selected modification option is not supported by chosen pipeline.",
      );
    }
  });
}

function validateStepIdsAgainstPipeline(
  steps: WorkflowStep[],
  pipeline: PipelineDefinition,
  path: string,
  issues: PlannerValidationIssue[],
): Set<string> {
  const allowedStepIds = new Set(pipeline.defaultWorkflowSteps.map((step) => step.id));
  const seen = new Set<string>();
  steps.forEach((step, index) => {
    seen.add(step.stepId);
    if (!allowedStepIds.has(step.stepId)) {
      pushIssue(
        issues,
        "step-outside-pipeline",
        `${path}[${index}].stepId`,
        "Step is not part of chosen pipeline default workflow steps.",
      );
    }
  });
  return seen;
}

function validateSupportedPolicy(
  result: SupportedRecommendationResult,
  context: PolicyValidationContext,
): PlannerValidationResult<SupportedRecommendationResult> {
  const issues: PlannerValidationIssue[] = [];
  const supportedPlannerPipelines = new Set(getSupportedPlannerPipelineIds());
  const chosenPipeline = context.availablePipelines.find((pipeline) => pipeline.id === result.chosenPipelineId);

  if (!supportedPlannerPipelines.has(result.chosenPipelineId)) {
    pushIssue(
      issues,
      "pipeline-not-supported-by-planner",
      "chosenPipelineId",
      "chosenPipelineId is outside bounded planner supported pipelines.",
    );
  }
  if (!chosenPipeline) {
    pushIssue(issues, "unknown-pipeline", "chosenPipelineId", "chosenPipelineId is not found in available pipeline context.");
    return { ok: false, issues };
  }

  const catalogById = new Map(context.functionCatalog.map((entry) => [entry.functionId, entry]));
  result.plannerFunctionCalls.forEach((call, index) => {
    const entry = catalogById.get(call.functionId);
    if (!entry) {
      pushIssue(
        issues,
        "disallowed-function-id",
        `plannerFunctionCalls[${index}].functionId`,
        "Function call is not present in bounded function catalog.",
      );
      return;
    }
    if (!isAllowedForPipeline(entry, result.chosenPipelineId)) {
      pushIssue(
        issues,
        "function-not-allowed-for-pipeline",
        `plannerFunctionCalls[${index}].functionId`,
        "Function call is not allowed for chosen pipeline.",
      );
    }
    if (entry.stage === "fallback") {
      pushIssue(
        issues,
        "fallback-function-in-supported-result",
        `plannerFunctionCalls[${index}].functionId`,
        "Supported result cannot include fallback-stage function calls.",
      );
    }
  });

  if (result.workflowProposal.pipelineId !== result.chosenPipelineId) {
    pushIssue(
      issues,
      "proposal-pipeline-mismatch",
      "workflowProposal.pipelineId",
      "workflowProposal.pipelineId must match chosenPipelineId.",
    );
  }
  if (result.suggestedWorkflow.pipelineId !== result.chosenPipelineId) {
    pushIssue(
      issues,
      "suggested-pipeline-mismatch",
      "suggestedWorkflow.pipelineId",
      "suggestedWorkflow.pipelineId must match chosenPipelineId.",
    );
  }
  if (result.approvalHandoff.selectedPipelineId !== result.chosenPipelineId) {
    pushIssue(
      issues,
      "handoff-pipeline-mismatch",
      "approvalHandoff.selectedPipelineId",
      "approvalHandoff.selectedPipelineId must match chosenPipelineId.",
    );
  }
  if (result.approvalHandoff.proposedWorkflow.pipelineId !== result.chosenPipelineId) {
    pushIssue(
      issues,
      "handoff-workflow-pipeline-mismatch",
      "approvalHandoff.proposedWorkflow.pipelineId",
      "approvalHandoff.proposedWorkflow.pipelineId must match chosenPipelineId.",
    );
  }

  const proposalStepIds = validateStepIdsAgainstPipeline(result.workflowProposal.steps, chosenPipeline, "workflowProposal.steps", issues);
  validateStepIdsAgainstPipeline(result.suggestedWorkflow.steps, chosenPipeline, "suggestedWorkflow.steps", issues);
  validateStepIdsAgainstPipeline(
    result.approvalHandoff.proposedWorkflow.steps,
    chosenPipeline,
    "approvalHandoff.proposedWorkflow.steps",
    issues,
  );

  result.addedSteps.forEach((step, index) => {
    if (!proposalStepIds.has(step.stepId)) {
      pushIssue(
        issues,
        "added-step-not-in-proposal",
        `addedSteps[${index}].stepId`,
        "addedSteps entries must exist in workflowProposal steps.",
      );
    }
  });
  result.modifiedSteps.forEach((step, index) => {
    if (!proposalStepIds.has(step.stepId)) {
      pushIssue(
        issues,
        "modified-step-not-in-proposal",
        `modifiedSteps[${index}].stepId`,
        "modifiedSteps entries must exist in workflowProposal steps.",
      );
    }
  });
  result.skippedSteps.forEach((step, index) => {
    if (!proposalStepIds.has(step.stepId)) {
      pushIssue(
        issues,
        "skipped-step-not-in-proposal",
        `skippedSteps[${index}].stepId`,
        "skippedSteps entries must exist in workflowProposal steps.",
      );
    }
    if (!step.skippedByAi) {
      pushIssue(
        issues,
        "skipped-step-flag-invalid",
        `skippedSteps[${index}].skippedByAi`,
        "skippedSteps entries must have skippedByAi=true.",
      );
    }
  });

  validateSelectedModifications(result.workflowProposal.selectedModifications, chosenPipeline, "workflowProposal.selectedModifications", issues);
  validateSelectedModifications(
    result.approvalHandoff.selectedModifications,
    chosenPipeline,
    "approvalHandoff.selectedModifications",
    issues,
  );

  return issues.length ? { ok: false, issues } : { ok: true, value: result };
}

function validateUnsupportedPolicy(
  result: UnsupportedRecommendationResult,
  context: PolicyValidationContext,
): PlannerValidationResult<UnsupportedRecommendationResult> {
  const issues: PlannerValidationIssue[] = [];
  const supportedPlannerPipelines = new Set(getSupportedPlannerPipelineIds());

  if (result.closestSupportedPipelineId !== null && !supportedPlannerPipelines.has(result.closestSupportedPipelineId)) {
    pushIssue(
      issues,
      "invalid-closest-supported-pipeline",
      "closestSupportedPipelineId",
      "closestSupportedPipelineId must be null or a planner-supported pipeline.",
    );
  }

  const catalogById = new Map(context.functionCatalog.map((entry) => [entry.functionId, entry]));
  result.plannerFunctionCalls.forEach((call, index) => {
    const entry = catalogById.get(call.functionId);
    if (!entry) {
      pushIssue(
        issues,
        "disallowed-function-id",
        `plannerFunctionCalls[${index}].functionId`,
        "Function call is not present in bounded function catalog.",
      );
      return;
    }
    if (entry.stage !== "fallback" && entry.stage !== "explanations") {
      pushIssue(
        issues,
        "non-fallback-function-in-unsupported-result",
        `plannerFunctionCalls[${index}].functionId`,
        "Unsupported result should only include fallback/explanation function calls.",
      );
    }
  });

  return issues.length ? { ok: false, issues } : { ok: true, value: result };
}

export function validatePlannerResultPolicy(
  result: AIRecommendationResult,
  context: PolicyValidationContext,
): PlannerValidationResult<AIRecommendationResult> {
  if (result.kind === "supported") {
    const supported = validateSupportedPolicy(result, context);
    if (!supported.ok) {
      return supported;
    }
    return { ok: true, value: supported.value };
  }
  const unsupported = validateUnsupportedPolicy(result, context);
  if (!unsupported.ok) {
    return unsupported;
  }
  return { ok: true, value: unsupported.value };
}
