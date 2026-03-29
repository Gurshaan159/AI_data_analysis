import type { PipelineDefinition, PipelineId } from "@/shared/types/pipeline";
import type { AIRecommendationResult } from "@/shared/types/ai";
import type { ApprovedWorkflow } from "@/shared/types/workflow";
import type { NormalizedRunRequest, SelectedFile } from "@/shared/types/run";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code:
    | "pipeline-missing"
    | "files-missing"
    | "output-folder-missing"
    | "file-kind-mismatch"
    | "metadata-missing"
    | "workflow-not-approved"
    | "ai-approval-missing"
    | "invalid-modification-option"
    | "run-request-not-constructible";
  message: string;
  field: "pipeline" | "files" | "outputFolder" | "workflow" | "recommendation" | "modifications" | "runRequest";
  severity: ValidationSeverity;
}

export interface MissingRequirement {
  requirementId: string;
  description: string;
}

export interface ValidationContext {
  selectedMode: "established" | "ai-assisted" | null;
  selectedPipelineId: PipelineId | null;
  selectedPipeline: PipelineDefinition | null;
  selectedFiles: SelectedFile[];
  outputFolder: string | null;
  selectedModifications: Record<string, string>;
  approvedWorkflow: ApprovedWorkflow | null;
  aiRecommendation: AIRecommendationResult | null;
  aiRecommendationApproved: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  fieldIssues: Record<string, ValidationIssue[]>;
  missingRequirements: MissingRequirement[];
  unsupportedFileCombinations: string[];
  incompleteApprovalState: boolean;
}

export interface RunRequestBuildResult {
  validation: ValidationResult;
  runRequest: NormalizedRunRequest | null;
}
