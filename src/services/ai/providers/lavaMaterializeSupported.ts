import { buildWorkflowFromPipeline } from "@/domain/workflow/workflowFactory";
import { extractPlannerIntentSignals } from "@/services/ai/intent/intentExtractor";
import { summarizeIntentSignals } from "@/services/ai/intent/intentTypes";
import { getSupportedPlannerPipelines } from "@/services/ai/planner/functionCatalog";
import { logPlannerDecisionTrace } from "@/services/ai/planner/decisionTraceLogger";
import type { LavaModelSupportedPayload } from "@/services/ai/providers/lavaModelPayload";
import type {
  PipelineDefinition,
  PlannerExplanationEntry,
  PlannerFunctionCall,
  PlannerFunctionCatalogEntry,
  SupportedRecommendationResult,
  SupportedPlannerPipelineId,
  WorkflowParameterChange,
  WorkflowStep,
} from "@/shared/types";

function recommendationId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
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

function pushCall(calls: PlannerFunctionCall[], call: PlannerFunctionCall): void {
  calls.push(call);
}

function pickValidModifications(
  pipeline: PipelineDefinition,
  raw?: Record<string, string>,
): Record<string, string> | undefined {
  if (!raw) {
    return undefined;
  }
  const out: Record<string, string> = {};
  Object.entries(raw).forEach(([slotId, optionId]) => {
    const slot = pipeline.modificationSlots.find((s) => s.id === slotId);
    if (!slot || typeof optionId !== "string") {
      return;
    }
    if (slot.supportedOptions.some((o) => o.id === optionId)) {
      out[slotId] = optionId;
    }
  });
  return Object.keys(out).length ? out : undefined;
}

export function materializeLavaSupportedRecommendation(args: {
  userPrompt: string;
  availablePipelines: PipelineDefinition[];
  functionCatalog: PlannerFunctionCatalogEntry[];
  model: LavaModelSupportedPayload;
}): SupportedRecommendationResult | null {
  const intentExtraction = extractPlannerIntentSignals(args.userPrompt);
  const intent = intentExtraction.signals;
  const chosenPipelineId = args.model.chosenPipelineId;
  const supportedPipelines = getSupportedPlannerPipelines(args.availablePipelines);
  const pipeline = supportedPipelines.find((item) => item.id === chosenPipelineId);
  if (!pipeline) {
    return null;
  }

  const selectFunctionId =
    chosenPipelineId === "count-matrix-analysis-v1" ? "select_pipeline_count_matrix" : "select_pipeline_bulk_rna_matrix";
  if (!ensureFunctionAllowed(args.functionCatalog, selectFunctionId, chosenPipelineId)) {
    return null;
  }

  const plannerFunctionCalls: PlannerFunctionCall[] = [];

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

  const baseWorkflow = buildWorkflowFromPipeline(chosenPipelineId, pickValidModifications(pipeline, args.model.selectedModifications));
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

  const skipIds = new Set(args.model.skippedStepIds ?? []);
  for (const stepId of skipIds) {
    const idx = steps.findIndex((s) => s.stepId === stepId);
    if (idx >= 0) {
      const skipped = {
        ...steps[idx],
        required: false,
        skippedByAi: true,
        modifiedByAi: true,
        explanation: `${steps[idx].explanation} Skipped per Lava planner output.`,
      };
      steps[idx] = skipped;
      skippedSteps.push(skipped);
      modifiedSteps.push(skipped);
    }
  }

  const invalidGroupingIntent =
    args.model.skipDifferentialDueToInvalidGrouping ?? intent.dataCharacteristics.unsureAboutGrouping;
  const differentialStepIndex = steps.findIndex((step) => step.stepId === differentialStepId);
  if (invalidGroupingIntent && differentialStepIndex >= 0 && !steps[differentialStepIndex].skippedByAi) {
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
  const preferTmm =
    args.model.preferTmmLikeNormalization ??
    (intent.dataCharacteristics.expectsNormalization && chosenPipelineId === "bulk-rna-matrix-downstream-v1");
  if (normalizationSlot && preferTmm && chosenPipelineId === "bulk-rna-matrix-downstream-v1") {
    const previousValue = nextSelectedModifications[normalizationSlot.id];
    if (previousValue !== "tmm-like") {
      nextSelectedModifications[normalizationSlot.id] = "tmm-like";
      const change: WorkflowParameterChange = {
        parameterKey: normalizationSlot.id,
        previousValue,
        nextValue: "tmm-like",
        summary: "Robust option selected from supported normalization options.",
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
    arguments: { pipelineId: chosenPipelineId, reason: `Lava planner selected ${pipeline.displayName} within bounded scope.` },
  });
  pushCall(plannerFunctionCalls, {
    functionId: "explain_added_step",
    arguments: { stepId: normalizationStepId, reason: "Normalization and reporting are required for supported matrix workflows." },
  });

  const defaultExplanations: PlannerExplanationEntry[] = [
    {
      id: "pipeline-choice",
      kind: "pipeline-choice",
      title: "Pipeline choice",
      detail: `Selected ${pipeline.displayName} from bounded v1 planner scope using Lava-assisted planning.`,
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

  const explanations = args.model.explanations?.length ? [...args.model.explanations, ...defaultExplanations] : defaultExplanations;

  if (invalidGroupingIntent) {
    explanations.push({
      id: "skip-de",
      kind: "step-skipped",
      title: "Skipped differential expression",
      detail: "Differential expression step was marked skipped because grouping intent appears invalid or unavailable.",
      sourceFunctionId: "explain_skipped_step",
      relatedStepId: differentialStepId,
    });
  }

  const warnings: string[] = [...(args.model.warnings ?? [])];
  if (intent.constraints.ambiguousInputDescription) {
    warnings.push("Input description is ambiguous; planner assumed matrix + metadata inputs for the recommended bounded workflow.");
  }
  if (invalidGroupingIntent) {
    warnings.push("Differential expression was skipped until grouping metadata is valid.");
  }
  if (!changedParameters.length) {
    warnings.push("Default pipeline modification options remain selected unless adjusted above.");
  }

  const plannedWorkflow = {
    ...baseWorkflow,
    steps,
    selectedModifications: nextSelectedModifications,
    warnings,
  };

  const assumptions: string[] = [
    "Planner is constrained to count-matrix-analysis-v1 and bulk-rna-matrix-downstream-v1.",
    "Lava output was materialized against the registered pipeline definitions before acceptance validation.",
    `Planner output generated through ${"lava"} provider boundary.`,
    ...(args.model.assumptions ?? []),
  ];

  const result: SupportedRecommendationResult = {
    kind: "supported",
    recommendationId: recommendationId("lava-supported"),
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
    assumptions,
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

  logPlannerDecisionTrace({
    providerLabel: "lava",
    intent: intentExtraction.signals,
    result,
  });

  return result;
}
