import { buildWorkflowFromPipeline } from "@/domain/workflow/workflowFactory";
import { extractPlannerIntentSignals } from "@/services/ai/intent/intentExtractor";
import { summarizeIntentSignals } from "@/services/ai/intent/intentTypes";
import { getSupportedPlannerPipelineIds } from "@/services/ai/planner/functionCatalog";
import type {
  AIRecommendationResult,
  PipelineDefinition,
  PlannerIntentSignals,
  PlannerExplanationEntry,
  PlannerFunctionCall,
  PlannerFunctionCatalogEntry,
  SuggestedResource,
  SupportedPlannerPipelineId,
  SupportedRecommendationResult,
  UnsupportedReasonCode,
  UnsupportedRecommendationResult,
  WorkflowParameterChange,
  WorkflowStep,
} from "@/shared/types";

export interface PlannerBoundaryRequest {
  userPrompt: string;
  availablePipelines: PipelineDefinition[];
  functionCatalog: PlannerFunctionCatalogEntry[];
  providerLabel: string;
}

function recommendationId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function buildFallbackResources(): SuggestedResource[] {
  return [
    {
      id: "supported-universe-note",
      title: "Supported workflow universe (v1)",
      description: "v1 supports matrix-first count analysis and bulk-RNA matrix downstream analysis only.",
      resourceType: "scope-note",
    },
    {
      id: "matrix-input-checklist",
      title: "Matrix + metadata preparation checklist",
      description: "Prepare a gene-by-sample count matrix and metadata table with sample_id and condition columns.",
      resourceType: "data-prep-checklist",
    },
  ];
}

function buildUnsupportedResult(args: {
  providerLabel: string;
  summary: string;
  reason: string;
  reasonCode: UnsupportedReasonCode;
  closestSupportedPipelineId: SupportedPlannerPipelineId | null;
  plannerFunctionCalls: PlannerFunctionCall[];
}): UnsupportedRecommendationResult {
  const explanations: PlannerExplanationEntry[] = [
    {
      id: "unsupported-fallback",
      kind: "fallback",
      title: "Unsupported request in bounded planner",
      detail: `${args.reason} Planner provider: ${args.providerLabel}.`,
      sourceFunctionId: "detect_unsupported_request",
    },
  ];
  return {
    kind: "unsupported",
    recommendationId: recommendationId("planner-unsupported"),
    unsupportedReasonCode: args.reasonCode,
    summary: args.summary,
    reason: args.reason,
    closestSupportedPipelineId: args.closestSupportedPipelineId,
    plannerFunctionCalls: args.plannerFunctionCalls,
    explanations,
    warnings: ["No out-of-scope workflow is invented by the planner."],
    assumptions: ["Only explicitly supported v1 planner functions and pipelines are allowed."],
    suggestedResources: buildFallbackResources(),
  };
}


function choosePipelineFromIntent(intent: PlannerIntentSignals): SupportedPlannerPipelineId {
  if (
    intent.dataCharacteristics.expectsDimensionalityReduction ||
    intent.desiredOutputs.wantsPca ||
    intent.desiredOutputs.wantsVolcanoPlot
  ) {
    return "bulk-rna-matrix-downstream-v1";
  }
  return "count-matrix-analysis-v1";
}

function pushCall(calls: PlannerFunctionCall[], call: PlannerFunctionCall): void {
  calls.push(call);
}

function ensureFunctionAllowed(
  catalog: PlannerFunctionCatalogEntry[],
  functionId: PlannerFunctionCall["functionId"],
  pipelineId: SupportedPlannerPipelineId | null,
): boolean {
  const entry = catalog.find((item) => item.functionId === functionId);
  if (!entry) {
    return false;
  }
  if (entry.allowedPipelineIds === "all") {
    return true;
  }
  if (!pipelineId) {
    return false;
  }
  return entry.allowedPipelineIds.includes(pipelineId);
}

export function planWithBoundedCatalog(request: PlannerBoundaryRequest): AIRecommendationResult | null {
  const intentExtraction = extractPlannerIntentSignals(request.userPrompt);
  if (!intentExtraction.normalizedPrompt) {
    return null;
  }
  const intent = intentExtraction.signals;

  const plannerFunctionCalls: PlannerFunctionCall[] = [];
  const supportedPipelineIds = new Set(getSupportedPlannerPipelineIds());
  const supportedPipelines = request.availablePipelines.filter((pipeline) =>
    supportedPipelineIds.has(pipeline.id as SupportedPlannerPipelineId),
  );

  if (!supportedPipelines.length) {
    pushCall(plannerFunctionCalls, {
      functionId: "detect_unsupported_request",
      arguments: {
        reasonCode: "supported-pipelines-unavailable",
        reason: "No supported v1 planner pipelines are currently available in registry context.",
      },
    });
    return buildUnsupportedResult({
      providerLabel: request.providerLabel,
      summary: "No supported planner pipelines are available.",
      reason: "The current pipeline registry does not expose the v1 matrix analysis pipelines.",
      reasonCode: "supported-pipelines-unavailable",
      closestSupportedPipelineId: null,
      plannerFunctionCalls,
    });
  }

  if (intent.constraints.unsupportedAnalysisRequested) {
    const closest = choosePipelineFromIntent(intent);
    pushCall(plannerFunctionCalls, {
      functionId: "detect_unsupported_request",
      arguments: {
        reasonCode: "outside-supported-universe",
        reason: "Intent extraction detected analysis families outside the bounded v1 planner scope.",
      },
    });
    pushCall(plannerFunctionCalls, {
      functionId: "suggest_closest_supported_workflow",
      arguments: { pipelineId: closest },
    });
    return buildUnsupportedResult({
      providerLabel: request.providerLabel,
      summary: "The request cannot be planned with currently supported workflows.",
      reason:
        "This planner version supports only count-matrix and bulk-RNA matrix-downstream workflows, and does not invent new analysis families.",
      reasonCode: "outside-supported-universe",
      closestSupportedPipelineId: closest,
      plannerFunctionCalls,
    });
  }

  const chosenPipelineId = choosePipelineFromIntent(intent);
  const pipeline = supportedPipelines.find((item) => item.id === chosenPipelineId);
  if (!pipeline) {
    pushCall(plannerFunctionCalls, {
      functionId: "detect_unsupported_request",
      arguments: {
        reasonCode: "supported-pipelines-unavailable",
        reason: `Selected pipeline ${chosenPipelineId} is not available in current registry context.`,
      },
    });
    return buildUnsupportedResult({
      providerLabel: request.providerLabel,
      summary: "Supported pipeline not currently available.",
      reason: `The planner selected ${chosenPipelineId}, but it is not present in available registry context.`,
      reasonCode: "supported-pipelines-unavailable",
      closestSupportedPipelineId: choosePipelineFromIntent(intent),
      plannerFunctionCalls,
    });
  }

  const selectFunctionId =
    chosenPipelineId === "count-matrix-analysis-v1" ? "select_pipeline_count_matrix" : "select_pipeline_bulk_rna_matrix";
  if (!ensureFunctionAllowed(request.functionCatalog, selectFunctionId, chosenPipelineId)) {
    return null;
  }

  if (chosenPipelineId === "count-matrix-analysis-v1") {
    pushCall(plannerFunctionCalls, {
      functionId: "select_pipeline_count_matrix",
      arguments: { pipelineId: "count-matrix-analysis-v1" },
    });
  } else {
    pushCall(plannerFunctionCalls, {
      functionId: "select_pipeline_bulk_rna_matrix",
      arguments: { pipelineId: "bulk-rna-matrix-downstream-v1" },
    });
  }
  pushCall(plannerFunctionCalls, { functionId: "require_matrix_input", arguments: { minimumFiles: 1 } });
  pushCall(plannerFunctionCalls, { functionId: "require_metadata_input", arguments: { minimumFiles: 1 } });
  pushCall(plannerFunctionCalls, {
    functionId: "require_grouping_configuration",
    arguments: { requiredField: "condition" },
  });

  const baseWorkflow = buildWorkflowFromPipeline(chosenPipelineId);
  if (!baseWorkflow) {
    return null;
  }

  const steps = baseWorkflow.steps.map((step) => ({ ...step, parameterChangeSummary: [...step.parameterChangeSummary] }));
  const modifiedSteps: WorkflowStep[] = [];
  const addedSteps: WorkflowStep[] = [];
  const skippedSteps: WorkflowStep[] = [];
  const changedParameters: WorkflowParameterChange[] = [];

  const normalizationStepId = chosenPipelineId === "count-matrix-analysis-v1" ? "matrix-normalize" : "bulk-matrix-normalize";
  const differentialStepId = chosenPipelineId === "count-matrix-analysis-v1" ? "matrix-model" : "bulk-matrix-model";

  pushCall(plannerFunctionCalls, { functionId: "add_normalization_step", arguments: { stepId: normalizationStepId } });
  pushCall(plannerFunctionCalls, {
    functionId: "add_differential_expression_step",
    arguments: { stepId: differentialStepId },
  });
  pushCall(plannerFunctionCalls, { functionId: "add_summary_report_step", arguments: { stepId: differentialStepId } });

  if (chosenPipelineId === "bulk-rna-matrix-downstream-v1") {
    pushCall(plannerFunctionCalls, { functionId: "add_pca_step", arguments: { stepId: "bulk-matrix-normalize" } });
    pushCall(plannerFunctionCalls, { functionId: "add_volcano_plot_step", arguments: { stepId: "bulk-matrix-model" } });
  }

  const invalidGroupingIntent = intent.dataCharacteristics.unsureAboutGrouping;
  const differentialStepIndex = steps.findIndex((step) => step.stepId === differentialStepId);
  if (invalidGroupingIntent && differentialStepIndex >= 0) {
    pushCall(plannerFunctionCalls, {
      functionId: "skip_differential_expression_when_grouping_invalid",
      arguments: { stepId: differentialStepId, reason: "Prompt indicates grouping is invalid or unavailable." },
    });
    pushCall(plannerFunctionCalls, {
      functionId: "explain_skipped_step",
      arguments: { stepId: differentialStepId, reason: "Differential expression needs valid grouping metadata." },
    });

    const skipped = {
      ...steps[differentialStepIndex],
      required: false,
      skippedByAi: true,
      modifiedByAi: true,
      explanation: `${steps[differentialStepIndex].explanation} Skipped for this plan because grouping configuration is invalid.`,
    };
    steps[differentialStepIndex] = skipped;
    skippedSteps.push(skipped);
    modifiedSteps.push(skipped);
  }

  const normalizationSlot = baseWorkflow.modificationSlots.find((slot) => slot.category === "normalization");
  const nextSelectedModifications = { ...baseWorkflow.selectedModifications };
  if (normalizationSlot && intent.dataCharacteristics.expectsNormalization && chosenPipelineId === "bulk-rna-matrix-downstream-v1") {
    const previousValue = nextSelectedModifications[normalizationSlot.id];
    if (previousValue !== "tmm-like") {
      nextSelectedModifications[normalizationSlot.id] = "tmm-like";
      const change: WorkflowParameterChange = {
        parameterKey: normalizationSlot.id,
        previousValue,
        nextValue: "tmm-like",
        summary: "Prompt suggests robust normalization against composition differences.",
      };
      changedParameters.push(change);
      pushCall(plannerFunctionCalls, {
        functionId: "explain_parameter_or_assumption",
        arguments: {
          key: normalizationSlot.id,
          value: "tmm-like",
          reason: "Robust option selected from supported normalization options.",
        },
      });

      const normalizeIndex = steps.findIndex((step) => step.stepId === normalizationStepId);
      if (normalizeIndex >= 0) {
        const modified = {
          ...steps[normalizeIndex],
          modifiedByAi: true,
          explanation: `${steps[normalizeIndex].explanation} Normalization option adjusted to tmm-like.`,
          parameterChangeSummary: [...steps[normalizeIndex].parameterChangeSummary, change],
        };
        steps[normalizeIndex] = modified;
        modifiedSteps.push(modified);
      }
    }
  }

  pushCall(plannerFunctionCalls, {
    functionId: "explain_pipeline_choice",
    arguments: { pipelineId: chosenPipelineId, reason: `Intent signals mapped to ${pipeline.displayName}.` },
  });
  pushCall(plannerFunctionCalls, {
    functionId: "explain_added_step",
    arguments: { stepId: normalizationStepId, reason: "Normalization and reporting are required for supported matrix workflows." },
  });

  const explanations: PlannerExplanationEntry[] = [
    {
      id: "pipeline-choice",
      kind: "pipeline-choice",
      title: "Pipeline choice",
      detail: `Selected ${pipeline.displayName} from bounded v1 planner scope using prompt intent mapping.`,
      sourceFunctionId: "explain_pipeline_choice",
    },
    {
      id: "intent-signals",
      kind: "parameter-assumption",
      title: "Interpreted intent signals",
      detail:
        summarizeIntentSignals(intent).slice(0, 3).join(" ") ||
        "No strong specialized signal detected; planner stayed within bounded matrix-first defaults.",
      sourceFunctionId: "explain_pipeline_choice",
    },
    {
      id: "requirements",
      kind: "parameter-assumption",
      title: "Required inputs",
      detail: "Planner requires matrix input, metadata input, and grouping metadata field `condition` for DE-capable plans.",
      sourceFunctionId: "require_grouping_configuration",
    },
    {
      id: "workflow-shape",
      kind: "step-added",
      title: "Workflow shape",
      detail:
        chosenPipelineId === "bulk-rna-matrix-downstream-v1"
          ? "Plan includes normalization, PCA output, differential expression, volcano plot, and summary report."
          : "Plan includes matrix validation, normalization, differential modeling, and summary report.",
      sourceFunctionId: "explain_added_step",
    },
  ];

  if (invalidGroupingIntent) {
    explanations.push({
      id: "skip-de",
      kind: "step-skipped",
      title: "Skipped differential expression",
      detail: "Differential expression step was marked skipped because prompt indicates invalid grouping intent.",
      sourceFunctionId: "explain_skipped_step",
      relatedStepId: differentialStepId,
    });
  }

  const warnings: string[] = [];
  if (intent.constraints.ambiguousInputDescription) {
    warnings.push("Input description is ambiguous; planner assumed matrix + metadata inputs for the recommended bounded workflow.");
  }
  if (invalidGroupingIntent) {
    warnings.push("Differential expression was skipped until grouping metadata is valid.");
  }
  if (!changedParameters.length) {
    warnings.push("Default pipeline modification options remain selected.");
  }

  const plannedWorkflow = {
    ...baseWorkflow,
    steps,
    selectedModifications: nextSelectedModifications,
    warnings,
  };

  const result: SupportedRecommendationResult = {
    kind: "supported",
    recommendationId: recommendationId("planner-supported"),
    chosenPipelineId,
    plannerFunctionCalls,
    workflowProposal: plannedWorkflow,
    suggestedWorkflow: plannedWorkflow,
    addedSteps,
    modifiedSteps,
    skippedSteps,
    changedParameters,
    explanations,
    warnings,
    assumptions: [
      "Planner is constrained to count-matrix-analysis-v1 and bulk-rna-matrix-downstream-v1.",
      "Prompt interpretation is performed through deterministic intent signal extraction before planning decisions.",
      `Planner output generated through ${request.providerLabel} provider boundary.`,
    ],
    suggestedResources: [
      {
        id: "supported-pipeline-note",
        title: "Supported pipeline note",
        description: "This plan uses only approved v1 workflows and function catalog operations.",
        resourceType: "pipeline-doc",
      },
    ],
    approvalHandoff: {
      selectedPipelineId: chosenPipelineId,
      selectedModifications: plannedWorkflow.selectedModifications,
      proposedWorkflow: plannedWorkflow,
      requiredUserActions: ["Review highlighted workflow changes", "Approve recommendation before continuing to run review"],
    },
  };

  return result;
}
