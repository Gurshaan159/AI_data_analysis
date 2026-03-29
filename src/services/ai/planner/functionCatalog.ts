import type {
  PipelineDefinition,
  PlannerFunctionCatalogEntry,
  SupportedPlannerPipelineId,
} from "@/shared/types";

// v1 freeze boundary:
// Add new planner-supported pipelines by extending SUPPORTED_PLANNER_PIPELINE_IDS
// and introducing corresponding function entries and validator allowances together.
const SUPPORTED_PLANNER_PIPELINE_IDS: SupportedPlannerPipelineId[] = [
  "count-matrix-analysis-v1",
  "bulk-rna-matrix-downstream-v1",
];

const BASE_FUNCTION_CATALOG: PlannerFunctionCatalogEntry[] = [
  {
    functionId: "select_pipeline_count_matrix",
    stage: "selection",
    description: "Select the count-matrix workflow when prompt intent matches matrix-based differential analysis.",
    allowedPipelineIds: ["count-matrix-analysis-v1"],
  },
  {
    functionId: "select_pipeline_bulk_rna_matrix",
    stage: "selection",
    description: "Select the bulk-RNA matrix downstream workflow when PCA/volcano-oriented downstream intent is present.",
    allowedPipelineIds: ["bulk-rna-matrix-downstream-v1"],
  },
  {
    functionId: "require_matrix_input",
    stage: "requirements",
    description: "Require at least one matrix input file for supported v1 planning.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "require_metadata_input",
    stage: "requirements",
    description: "Require at least one metadata file for supported v1 planning.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "require_grouping_configuration",
    stage: "requirements",
    description: "Require condition/group metadata for differential-expression-capable plans.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "add_normalization_step",
    stage: "workflow-shaping",
    description: "Include a normalization step in the supported proposal.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "add_pca_step",
    stage: "workflow-shaping",
    description: "Include PCA-oriented outputs when using the bulk RNA matrix downstream pipeline.",
    allowedPipelineIds: ["bulk-rna-matrix-downstream-v1"],
  },
  {
    functionId: "add_differential_expression_step",
    stage: "workflow-shaping",
    description: "Include differential expression modeling when grouping assumptions are valid.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "add_volcano_plot_step",
    stage: "workflow-shaping",
    description: "Include volcano plot output when using the bulk RNA matrix downstream pipeline.",
    allowedPipelineIds: ["bulk-rna-matrix-downstream-v1"],
  },
  {
    functionId: "add_summary_report_step",
    stage: "workflow-shaping",
    description: "Include summary reporting outputs in all supported plans.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "skip_differential_expression_when_grouping_invalid",
    stage: "workflow-shaping",
    description: "Skip differential-expression modeling when grouping intent is explicitly invalid or unavailable.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "explain_pipeline_choice",
    stage: "explanations",
    description: "Provide structured explanation of why a supported pipeline was selected.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "explain_added_step",
    stage: "explanations",
    description: "Provide step-level explanation for included/adjusted workflow content.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "explain_skipped_step",
    stage: "explanations",
    description: "Provide step-level explanation when a workflow step is skipped.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "explain_parameter_or_assumption",
    stage: "explanations",
    description: "Explain parameter choices and assumptions in structured form.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "detect_unsupported_request",
    stage: "fallback",
    description: "Detect prompts that cannot be fulfilled within the bounded v1 pipeline universe.",
    allowedPipelineIds: "all",
  },
  {
    functionId: "suggest_closest_supported_workflow",
    stage: "fallback",
    description: "Suggest the closest supported pipeline when a request is otherwise unsupported.",
    allowedPipelineIds: "all",
  },
];

export function getSupportedPlannerPipelineIds(): SupportedPlannerPipelineId[] {
  return [...SUPPORTED_PLANNER_PIPELINE_IDS];
}

export function getSupportedPlannerPipelines(availablePipelines: PipelineDefinition[]): PipelineDefinition[] {
  const allowed = new Set(getSupportedPlannerPipelineIds());
  return availablePipelines.filter((pipeline) => allowed.has(pipeline.id as SupportedPlannerPipelineId));
}

export function buildPlannerFunctionCatalog(availablePipelines: PipelineDefinition[]): PlannerFunctionCatalogEntry[] {
  const availableIds = new Set(getSupportedPlannerPipelines(availablePipelines).map((pipeline) => pipeline.id));
  return BASE_FUNCTION_CATALOG.filter((entry) => {
    if (entry.allowedPipelineIds === "all") {
      return true;
    }
    return entry.allowedPipelineIds.some((pipelineId) => availableIds.has(pipelineId));
  });
}
