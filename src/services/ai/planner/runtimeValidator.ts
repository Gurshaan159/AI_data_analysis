import type {
  AIRecommendationResult,
  PipelineDefinition,
  PlannerFunctionId,
  SupportedRecommendationResult,
  UnsupportedRecommendationResult,
} from "@/shared/types";
import type { PlannerValidationIssue, PlannerValidationResult } from "@/services/ai/planner/validationTypes";

interface RuntimeValidationContext {
  availablePipelines: PipelineDefinition[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function knownPipelineIds(context: RuntimeValidationContext): Set<string> {
  return new Set(context.availablePipelines.map((pipeline) => pipeline.id));
}

function pushIssue(issues: PlannerValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ stage: "runtime-schema", code, path, message });
}

function validateWorkflowStepShape(value: unknown, path: string, issues: PlannerValidationIssue[]): void {
  if (!isRecord(value)) {
    pushIssue(issues, "invalid-step", path, "Workflow step must be an object.");
    return;
  }
  const requiredStringKeys = ["stepId", "displayLabel", "category", "explanation"];
  requiredStringKeys.forEach((key) => {
    if (typeof value[key] !== "string" || !String(value[key]).trim()) {
      pushIssue(issues, "invalid-step-field", `${path}.${key}`, "Workflow step field must be a non-empty string.");
    }
  });
  const requiredBooleanKeys = ["required", "addedByAi", "modifiedByAi", "skippedByAi"];
  requiredBooleanKeys.forEach((key) => {
    if (typeof value[key] !== "boolean") {
      pushIssue(issues, "invalid-step-field", `${path}.${key}`, "Workflow step flag must be a boolean.");
    }
  });
  if (!Array.isArray(value.parameterChangeSummary)) {
    pushIssue(issues, "invalid-step-field", `${path}.parameterChangeSummary`, "Step parameterChangeSummary must be an array.");
  }
  if (!Array.isArray(value.expectedOutputs) || !value.expectedOutputs.every((item) => typeof item === "string")) {
    pushIssue(issues, "invalid-step-field", `${path}.expectedOutputs`, "Step expectedOutputs must be an array of strings.");
  }
}

function validateWorkflowShape(value: unknown, path: string, issues: PlannerValidationIssue[]): void {
  if (!isRecord(value)) {
    pushIssue(issues, "invalid-workflow", path, "Workflow must be an object.");
    return;
  }
  if (typeof value.pipelineId !== "string" || !value.pipelineId.trim()) {
    pushIssue(issues, "invalid-workflow", `${path}.pipelineId`, "Workflow pipelineId must be a non-empty string.");
  }
  if (!Array.isArray(value.steps)) {
    pushIssue(issues, "invalid-workflow", `${path}.steps`, "Workflow steps must be an array.");
  } else {
    value.steps.forEach((step, index) => validateWorkflowStepShape(step, `${path}.steps[${index}]`, issues));
  }
  if (!Array.isArray(value.modificationSlots)) {
    pushIssue(issues, "invalid-workflow", `${path}.modificationSlots`, "Workflow modificationSlots must be an array.");
  }
  if (!isRecord(value.selectedModifications)) {
    pushIssue(
      issues,
      "invalid-workflow",
      `${path}.selectedModifications`,
      "Workflow selectedModifications must be a key-value object.",
    );
  }
  if (!isStringArray(value.warnings)) {
    pushIssue(issues, "invalid-workflow", `${path}.warnings`, "Workflow warnings must be a string array.");
  }
}

function validateFunctionCallsShape(value: unknown, path: string, issues: PlannerValidationIssue[]): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, "invalid-function-calls", path, "plannerFunctionCalls must be an array.");
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      pushIssue(issues, "invalid-function-call", `${path}[${index}]`, "Planner function call must be an object.");
      return;
    }
    if (typeof entry.functionId !== "string" || !entry.functionId.trim()) {
      pushIssue(issues, "invalid-function-call", `${path}[${index}].functionId`, "functionId must be a non-empty string.");
    }
    if (!isRecord(entry.arguments)) {
      pushIssue(issues, "invalid-function-call", `${path}[${index}].arguments`, "arguments must be an object.");
    }
  });
}

function validateExplanationsShape(value: unknown, path: string, issues: PlannerValidationIssue[]): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, "invalid-explanations", path, "explanations must be an array.");
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      pushIssue(issues, "invalid-explanation", `${path}[${index}]`, "Explanation entry must be an object.");
      return;
    }
    const requiredKeys = ["id", "kind", "title", "detail", "sourceFunctionId"];
    requiredKeys.forEach((key) => {
      if (typeof entry[key] !== "string" || !String(entry[key]).trim()) {
        pushIssue(issues, "invalid-explanation", `${path}[${index}].${key}`, "Explanation field must be a non-empty string.");
      }
    });
  });
}

function validateResourcesShape(value: unknown, path: string, issues: PlannerValidationIssue[]): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, "invalid-resources", path, "suggestedResources must be an array.");
    return;
  }
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      pushIssue(issues, "invalid-resource", `${path}[${index}]`, "Resource entry must be an object.");
      return;
    }
    ["id", "title", "description", "resourceType"].forEach((key) => {
      if (typeof entry[key] !== "string" || !String(entry[key]).trim()) {
        pushIssue(issues, "invalid-resource", `${path}[${index}].${key}`, "Resource field must be a non-empty string.");
      }
    });
    if (entry.url !== undefined && typeof entry.url !== "string") {
      pushIssue(issues, "invalid-resource", `${path}[${index}].url`, "Resource url must be a string when present.");
    }
    if (entry.citation !== undefined && typeof entry.citation !== "string") {
      pushIssue(issues, "invalid-resource", `${path}[${index}].citation`, "Resource citation must be a string when present.");
    }
  });
}

function validateSupportedRuntime(
  value: Record<string, unknown>,
  context: RuntimeValidationContext,
): PlannerValidationResult<SupportedRecommendationResult> {
  const issues: PlannerValidationIssue[] = [];
  const knownPipelines = knownPipelineIds(context);

  if (typeof value.recommendationId !== "string" || !value.recommendationId.trim()) {
    pushIssue(issues, "invalid-supported", "recommendationId", "recommendationId must be a non-empty string.");
  }
  if (typeof value.chosenPipelineId !== "string" || !value.chosenPipelineId.trim()) {
    pushIssue(issues, "invalid-supported", "chosenPipelineId", "chosenPipelineId must be a non-empty string.");
  } else if (!knownPipelines.has(value.chosenPipelineId)) {
    pushIssue(issues, "unknown-pipeline", "chosenPipelineId", "chosenPipelineId is not found in available pipeline context.");
  }

  validateFunctionCallsShape(value.plannerFunctionCalls, "plannerFunctionCalls", issues);
  validateWorkflowShape(value.workflowProposal, "workflowProposal", issues);
  validateWorkflowShape(value.suggestedWorkflow, "suggestedWorkflow", issues);

  ["addedSteps", "modifiedSteps", "skippedSteps"].forEach((key) => {
    const list = value[key];
    if (!Array.isArray(list)) {
      pushIssue(issues, "invalid-supported", key, `${key} must be an array.`);
      return;
    }
    list.forEach((step, index) => validateWorkflowStepShape(step, `${key}[${index}]`, issues));
  });

  if (!Array.isArray(value.changedParameters)) {
    pushIssue(issues, "invalid-supported", "changedParameters", "changedParameters must be an array.");
  } else {
    value.changedParameters.forEach((entry, index) => {
      if (!isRecord(entry)) {
        pushIssue(issues, "invalid-supported", `changedParameters[${index}]`, "changedParameters entry must be an object.");
        return;
      }
      ["parameterKey", "previousValue", "nextValue", "summary"].forEach((key) => {
        if (typeof entry[key] !== "string") {
          pushIssue(
            issues,
            "invalid-supported",
            `changedParameters[${index}].${key}`,
            "changedParameters fields must be strings.",
          );
        }
      });
    });
  }

  validateExplanationsShape(value.explanations, "explanations", issues);

  if (!isStringArray(value.warnings)) {
    pushIssue(issues, "invalid-supported", "warnings", "warnings must be a string array.");
  }
  if (!isStringArray(value.assumptions)) {
    pushIssue(issues, "invalid-supported", "assumptions", "assumptions must be a string array.");
  }
  validateResourcesShape(value.suggestedResources, "suggestedResources", issues);

  if (!isRecord(value.approvalHandoff)) {
    pushIssue(issues, "invalid-supported", "approvalHandoff", "approvalHandoff must be an object.");
  } else {
    if (typeof value.approvalHandoff.selectedPipelineId !== "string" || !value.approvalHandoff.selectedPipelineId.trim()) {
      pushIssue(
        issues,
        "invalid-supported",
        "approvalHandoff.selectedPipelineId",
        "approvalHandoff.selectedPipelineId must be a non-empty string.",
      );
    }
    if (!isRecord(value.approvalHandoff.selectedModifications)) {
      pushIssue(
        issues,
        "invalid-supported",
        "approvalHandoff.selectedModifications",
        "approvalHandoff.selectedModifications must be a key-value object.",
      );
    }
    validateWorkflowShape(value.approvalHandoff.proposedWorkflow, "approvalHandoff.proposedWorkflow", issues);
    if (!isStringArray(value.approvalHandoff.requiredUserActions)) {
      pushIssue(
        issues,
        "invalid-supported",
        "approvalHandoff.requiredUserActions",
        "approvalHandoff.requiredUserActions must be a string array.",
      );
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: value as unknown as SupportedRecommendationResult };
}

function validateUnsupportedRuntime(
  value: Record<string, unknown>,
): PlannerValidationResult<UnsupportedRecommendationResult> {
  const issues: PlannerValidationIssue[] = [];

  ["recommendationId", "unsupportedReasonCode", "summary", "reason"].forEach((key) => {
    if (typeof value[key] !== "string" || !String(value[key]).trim()) {
      pushIssue(issues, "invalid-unsupported", key, `${key} must be a non-empty string.`);
    }
  });

  if (!(value.closestSupportedPipelineId === null || typeof value.closestSupportedPipelineId === "string")) {
    pushIssue(
      issues,
      "invalid-unsupported",
      "closestSupportedPipelineId",
      "closestSupportedPipelineId must be null or a string.",
    );
  }

  validateFunctionCallsShape(value.plannerFunctionCalls, "plannerFunctionCalls", issues);
  validateExplanationsShape(value.explanations, "explanations", issues);

  if (!isStringArray(value.warnings)) {
    pushIssue(issues, "invalid-unsupported", "warnings", "warnings must be a string array.");
  }
  if (!isStringArray(value.assumptions)) {
    pushIssue(issues, "invalid-unsupported", "assumptions", "assumptions must be a string array.");
  }
  validateResourcesShape(value.suggestedResources, "suggestedResources", issues);

  return issues.length ? { ok: false, issues } : { ok: true, value: value as unknown as UnsupportedRecommendationResult };
}

export function validateSupportedPlannerResultRuntime(
  input: unknown,
  context: RuntimeValidationContext,
): PlannerValidationResult<SupportedRecommendationResult> {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          stage: "runtime-schema",
          code: "invalid-supported-root",
          path: "",
          message: "Supported planner result must be an object.",
        },
      ],
    };
  }
  if (input.kind !== "supported") {
    return {
      ok: false,
      issues: [
        {
          stage: "runtime-schema",
          code: "invalid-supported-kind",
          path: "kind",
          message: "Expected kind to be supported.",
        },
      ],
    };
  }
  return validateSupportedRuntime(input, context);
}

export function validateUnsupportedPlannerResultRuntime(
  input: unknown,
): PlannerValidationResult<UnsupportedRecommendationResult> {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          stage: "runtime-schema",
          code: "invalid-unsupported-root",
          path: "",
          message: "Unsupported planner result must be an object.",
        },
      ],
    };
  }
  if (input.kind !== "unsupported") {
    return {
      ok: false,
      issues: [
        {
          stage: "runtime-schema",
          code: "invalid-unsupported-kind",
          path: "kind",
          message: "Expected kind to be unsupported.",
        },
      ],
    };
  }
  return validateUnsupportedRuntime(input);
}

export function validatePlannerResultRuntime(
  input: unknown,
  context: RuntimeValidationContext,
): PlannerValidationResult<AIRecommendationResult> {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          stage: "runtime-schema",
          code: "invalid-root",
          path: "",
          message: "Planner result must be an object.",
        },
      ],
    };
  }
  if (input.kind === "supported") {
    return validateSupportedRuntime(input, context);
  }
  if (input.kind === "unsupported") {
    return validateUnsupportedRuntime(input);
  }
  return {
    ok: false,
    issues: [
      {
        stage: "runtime-schema",
        code: "invalid-discriminator",
        path: "kind",
        message: "Planner result kind must be either supported or unsupported.",
      },
    ],
  };
}

export function isKnownPlannerFunctionId(value: unknown): value is PlannerFunctionId {
  return typeof value === "string";
}
