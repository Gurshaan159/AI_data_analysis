import type { NormalizedWorkflow, WorkflowParameterChange, WorkflowStep } from "@/shared/types/workflow";

export interface SuggestedResource {
  id: string;
  title: string;
  description: string;
  resourceType: "pipeline-doc" | "data-prep-checklist" | "scope-note" | "placeholder";
  citation?: string;
  url?: string;
}

export type SupportedPlannerPipelineId = "count-matrix-analysis-v1" | "bulk-rna-matrix-downstream-v1";

export interface PlannerIntentSignals {
  dataCharacteristics: {
    hasMatrixData: boolean;
    hasMetadata: boolean;
    expectsGroupComparison: boolean;
    unsureAboutGrouping: boolean;
    expectsDimensionalityReduction: boolean;
    expectsNormalization: boolean;
    expectsVisualization: boolean;
  };
  desiredOutputs: {
    wantsPca: boolean;
    wantsDifferentialExpression: boolean;
    wantsVolcanoPlot: boolean;
    wantsSummaryReport: boolean;
  };
  problemFraming: {
    wantsBasicAnalysis: boolean;
    wantsComparisonBetweenConditions: boolean;
    unsureWhatAnalysisToRun: boolean;
    wantsRecommendation: boolean;
  };
  constraints: {
    ambiguousInputDescription: boolean;
    unsupportedAnalysisRequested: boolean;
  };
}

export type PlannerFunctionId =
  | "select_pipeline_count_matrix"
  | "select_pipeline_bulk_rna_matrix"
  | "require_matrix_input"
  | "require_metadata_input"
  | "require_grouping_configuration"
  | "add_normalization_step"
  | "add_pca_step"
  | "add_differential_expression_step"
  | "add_volcano_plot_step"
  | "add_summary_report_step"
  | "skip_differential_expression_when_grouping_invalid"
  | "explain_pipeline_choice"
  | "explain_added_step"
  | "explain_skipped_step"
  | "explain_parameter_or_assumption"
  | "detect_unsupported_request"
  | "suggest_closest_supported_workflow";

export interface PlannerFunctionCatalogEntry {
  functionId: PlannerFunctionId;
  stage: "selection" | "requirements" | "workflow-shaping" | "explanations" | "fallback";
  description: string;
  allowedPipelineIds: SupportedPlannerPipelineId[] | "all";
}

interface PlannerFunctionArgumentsById {
  select_pipeline_count_matrix: { pipelineId: "count-matrix-analysis-v1" };
  select_pipeline_bulk_rna_matrix: { pipelineId: "bulk-rna-matrix-downstream-v1" };
  require_matrix_input: { minimumFiles: number };
  require_metadata_input: { minimumFiles: number };
  require_grouping_configuration: { requiredField: "condition" };
  add_normalization_step: { stepId: string };
  add_pca_step: { stepId: string };
  add_differential_expression_step: { stepId: string };
  add_volcano_plot_step: { stepId: string };
  add_summary_report_step: { stepId: string };
  skip_differential_expression_when_grouping_invalid: { stepId: string; reason: string };
  explain_pipeline_choice: { pipelineId: SupportedPlannerPipelineId; reason: string };
  explain_added_step: { stepId: string; reason: string };
  explain_skipped_step: { stepId: string; reason: string };
  explain_parameter_or_assumption: { key: string; value: string; reason: string };
  detect_unsupported_request: { reasonCode: UnsupportedReasonCode; reason: string };
  suggest_closest_supported_workflow: { pipelineId: SupportedPlannerPipelineId };
}

export type PlannerFunctionCall = {
  [K in PlannerFunctionId]: {
    functionId: K;
    arguments: PlannerFunctionArgumentsById[K];
  };
}[PlannerFunctionId];

export interface PlannerExplanationEntry {
  id: string;
  kind: "pipeline-choice" | "step-added" | "step-skipped" | "parameter-assumption" | "fallback";
  title: string;
  detail: string;
  sourceFunctionId: PlannerFunctionId;
  relatedStepId?: string;
}

export interface PlannerApprovalHandoff {
  selectedPipelineId: SupportedPlannerPipelineId;
  selectedModifications: Record<string, string>;
  proposedWorkflow: NormalizedWorkflow;
  requiredUserActions: string[];
}

export interface PlannerApprovalContext {
  recommendationId: string;
  plannerFunctionCalls: PlannerFunctionCall[];
  explanations: PlannerExplanationEntry[];
  addedSteps: WorkflowStep[];
  modifiedSteps: WorkflowStep[];
  skippedSteps: WorkflowStep[];
  changedParameters: WorkflowParameterChange[];
  warnings: string[];
  assumptions: string[];
}

export interface ApprovedAiWorkflowHandoff {
  selectedPipelineId: SupportedPlannerPipelineId;
  selectedModifications: Record<string, string>;
  workflow: NormalizedWorkflow;
  plannerContext: PlannerApprovalContext;
}

export type UnsupportedReasonCode =
  | "outside-supported-universe"
  | "missing-required-matrix-context"
  | "supported-pipelines-unavailable"
  | "invalid-provider-output-shape"
  | "planner-policy-violation";

export interface SupportedRecommendationResult {
  kind: "supported";
  recommendationId: string;
  chosenPipelineId: SupportedPlannerPipelineId;
  plannerFunctionCalls: PlannerFunctionCall[];
  workflowProposal: NormalizedWorkflow;
  suggestedWorkflow: NormalizedWorkflow;
  addedSteps: WorkflowStep[];
  modifiedSteps: WorkflowStep[];
  skippedSteps: WorkflowStep[];
  changedParameters: WorkflowParameterChange[];
  explanations: PlannerExplanationEntry[];
  warnings: string[];
  assumptions: string[];
  suggestedResources: SuggestedResource[];
  approvalHandoff: PlannerApprovalHandoff;
}

export interface UnsupportedRecommendationResult {
  kind: "unsupported";
  recommendationId: string;
  unsupportedReasonCode: UnsupportedReasonCode;
  summary: string;
  reason: string;
  closestSupportedPipelineId: SupportedPlannerPipelineId | null;
  plannerFunctionCalls: PlannerFunctionCall[];
  explanations: PlannerExplanationEntry[];
  warnings: string[];
  assumptions: string[];
  suggestedResources: SuggestedResource[];
}

export type AIRecommendationResult = SupportedRecommendationResult | UnsupportedRecommendationResult;
export type AIRecommendationStatus = "idle" | "loading" | "supported" | "unsupported" | "error";
