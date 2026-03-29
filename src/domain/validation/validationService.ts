import type { PipelineDefinition, ValidationIssue, ValidationResult } from "@/shared/types";
import type { ValidationContext, RunRequestBuildResult } from "@/shared/types";
import type { NormalizedRunRequest, SelectedFile } from "@/shared/types";

function buildValidationResult(issues: ValidationIssue[], unsupportedFileCombinations: string[] = []): ValidationResult {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const fieldIssues = issues.reduce<Record<string, ValidationIssue[]>>((acc, issue) => {
    const existing = acc[issue.field] ?? [];
    return { ...acc, [issue.field]: [...existing, issue] };
  }, {});

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fieldIssues,
    missingRequirements: [],
    unsupportedFileCombinations,
    incompleteApprovalState: issues.some(
      (issue) => issue.code === "workflow-not-approved" || issue.code === "ai-approval-missing",
    ),
  };
}

function countFilesByKind(files: SelectedFile[]): Record<string, number> {
  return files.reduce<Record<string, number>>((acc, file) => {
    return { ...acc, [file.kind]: (acc[file.kind] ?? 0) + 1 };
  }, {});
}

export function validatePipelineSelection(selectedPipeline: PipelineDefinition | null): ValidationResult {
  if (selectedPipeline) {
    return buildValidationResult([]);
  }
  return buildValidationResult([
    {
      code: "pipeline-missing",
      message: "Select a pipeline before continuing.",
      field: "pipeline",
      severity: "error",
    },
  ]);
}

export function validateSelectedFilesAgainstPipeline(
  selectedFiles: SelectedFile[],
  selectedPipeline: PipelineDefinition | null,
): ValidationResult {
  if (!selectedPipeline) {
    return buildValidationResult([]);
  }
  const issues: ValidationIssue[] = [];
  if (selectedFiles.length === 0) {
    issues.push({
      code: "files-missing",
      message: "Select input files before continuing.",
      field: "files",
      severity: "error",
    });
    return buildValidationResult(issues);
  }

  const byKind = countFilesByKind(selectedFiles);
  const unsupportedKinds = Object.keys(byKind).filter(
    (kind) => !selectedPipeline.supportedInputKinds.some((input) => input.kind === kind),
  );
  selectedPipeline.supportedInputKinds.forEach((requirement) => {
    const available = byKind[requirement.kind] ?? 0;
    if (available < requirement.minFiles) {
      issues.push({
        code: requirement.kind === "metadata" ? "metadata-missing" : "file-kind-mismatch",
        message: `Requires at least ${requirement.minFiles} ${requirement.kind} file(s): ${requirement.description}`,
        field: "files",
        severity: "error",
      });
    }
  });

  if (unsupportedKinds.length) {
    issues.push({
      code: "file-kind-mismatch",
      message: `Selected files include unsupported kinds for ${selectedPipeline.displayName}: ${unsupportedKinds.join(", ")}.`,
      field: "files",
      severity: "error",
    });
  }

  return buildValidationResult(
    issues,
    unsupportedKinds.map((kind) => `${kind} is not supported by ${selectedPipeline.displayName}`),
  );
}

export function validateOutputFolder(outputFolder: string | null): ValidationResult {
  if (outputFolder) {
    return buildValidationResult([]);
  }
  return buildValidationResult([
    {
      code: "output-folder-missing",
      message: "Choose an output folder before running.",
      field: "outputFolder",
      severity: "error",
    },
  ]);
}

export function validateWorkflowApproval(approved: boolean): ValidationResult {
  if (approved) {
    return buildValidationResult([]);
  }
  return buildValidationResult([
    {
      code: "workflow-not-approved",
      message: "Approve workflow before continuing.",
      field: "workflow",
      severity: "error",
    },
  ]);
}

export function validateRecommendationApproval(isApproved: boolean): ValidationResult {
  if (isApproved) {
    return buildValidationResult([]);
  }
  return buildValidationResult([
    {
      code: "ai-approval-missing",
      message: "Approve the AI recommendation before continuing.",
      field: "recommendation",
      severity: "error",
    },
  ]);
}

export function validateSelectedModifications(
  selectedModifications: Record<string, string>,
  selectedPipeline: PipelineDefinition | null,
): ValidationResult {
  if (!selectedPipeline) {
    return buildValidationResult([]);
  }
  const issues: ValidationIssue[] = [];
  selectedPipeline.modificationSlots.forEach((slot) => {
    const selectedOption = selectedModifications[slot.id] ?? slot.defaultOptionId;
    const isAllowed = slot.supportedOptions.some((option) => option.id === selectedOption);
    if (!isAllowed) {
      issues.push({
        code: "invalid-modification-option",
        message: `Invalid option selected for ${slot.label}.`,
        field: "modifications",
        severity: "error",
      });
    }
  });
  return buildValidationResult(issues);
}

function combineValidation(results: ValidationResult[]): ValidationResult {
  const issues = results.flatMap((result) => [...result.errors, ...result.warnings]);
  const unsupported = results.flatMap((result) => result.unsupportedFileCombinations);
  return buildValidationResult(issues, unsupported);
}

export function validateRunRequest(context: ValidationContext): ValidationResult {
  const checks = [
    validatePipelineSelection(context.selectedPipeline),
    validateSelectedFilesAgainstPipeline(context.selectedFiles, context.selectedPipeline),
    validateOutputFolder(context.outputFolder),
    validateSelectedModifications(context.selectedModifications, context.selectedPipeline),
    validateWorkflowApproval(Boolean(context.approvedWorkflow)),
  ];

  if (context.selectedMode === "ai-assisted") {
    checks.push(validateRecommendationApproval(context.aiRecommendationApproved));
  }

  return combineValidation(checks);
}

export function buildRunRequestIfValid(
  context: ValidationContext & {
    executionMode: NormalizedRunRequest["executionMode"];
    selectedMode: "established" | "ai-assisted" | null;
  },
): RunRequestBuildResult {
  const validation = validateRunRequest(context);
  if (!validation.isValid || !context.selectedPipelineId || !context.outputFolder || !context.approvedWorkflow) {
    const withConstructIssue = buildValidationResult([
      ...validation.errors,
      ...validation.warnings,
      {
        code: "run-request-not-constructible",
        message: "Run request cannot be built until all required fields are valid.",
        field: "runRequest",
        severity: "error",
      },
    ]);
    return { validation: withConstructIssue, runRequest: null };
  }

  return {
    validation,
    runRequest: {
      selectedPipelineId: context.selectedPipelineId,
      selectedFiles: context.selectedFiles,
      outputFolder: context.outputFolder,
      approvedWorkflow: context.approvedWorkflow,
      selectedModifications: context.selectedModifications,
      executionMode: context.executionMode,
    },
  };
}
