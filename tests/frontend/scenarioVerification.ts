import { buildWorkflowFromPipeline } from "@/domain/workflow/workflowFactory";
import { buildRunRequestIfValid, validateSelectedFilesAgainstPipeline } from "@/domain/validation/validationService";
import { getPipelineById, getPipelineRegistry } from "@/registry/pipelineRegistry";
import { recommendWorkflow } from "@/services/ai/recommendationService";
import type { NormalizedWorkflow, PipelineId } from "@/shared/types";

interface ScenarioResult {
  name: string;
  pass: boolean;
  detail: string;
}

function approvedWorkflow(pipelineId: PipelineId, workflow: NormalizedWorkflow | null) {
  if (!workflow) {
    return null;
  }
  return {
    pipelineId,
    approvedAtIso: "2026-03-28T12:00:00.000Z",
    workflow,
  };
}

function logScenarioResult(result: ScenarioResult) {
  const status = result.pass ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`${status} | ${result.name} | ${result.detail}`);
}

async function runVerificationScenarios() {
  const bulkPipeline = getPipelineById("bulk-rna-seq-v1");
  const bulkWorkflow = buildWorkflowFromPipeline("bulk-rna-seq-v1");
  const bulkFiles = [
    { path: "/mock/sampleA_R1.fastq.gz", kind: "fastq" as const },
    { path: "/mock/sampleA_R2.fastq.gz", kind: "fastq" as const },
    { path: "/mock/sample_sheet.csv", kind: "metadata" as const },
  ];

  const scenario1 = buildRunRequestIfValid({
    selectedMode: "established",
    selectedPipelineId: "bulk-rna-seq-v1",
    selectedPipeline: bulkPipeline ?? null,
    selectedFiles: bulkFiles,
    outputFolder: "/mock/output",
    selectedModifications: {
      "bulk-rna-reference-build": "grch38",
      "bulk-rna-stringency": "standard",
    },
    approvedWorkflow: approvedWorkflow("bulk-rna-seq-v1", bulkWorkflow),
    aiRecommendation: null,
    aiRecommendationApproved: false,
    executionMode: "mock-local",
  });
  logScenarioResult({
    name: "Scenario1 run request build",
    pass: Boolean(scenario1.runRequest) && scenario1.validation.isValid,
    detail: `errors=${scenario1.validation.errors.length}`,
  });

  const scenario2NoPipeline = buildRunRequestIfValid({
    selectedMode: "established",
    selectedPipelineId: null,
    selectedPipeline: null,
    selectedFiles: [],
    outputFolder: null,
    selectedModifications: {},
    approvedWorkflow: null,
    aiRecommendation: null,
    aiRecommendationApproved: false,
    executionMode: "mock-local",
  });
  logScenarioResult({
    name: "Scenario2 no pipeline",
    pass: scenario2NoPipeline.validation.errors.some((error) => error.code === "pipeline-missing"),
    detail: "contains pipeline-missing",
  });

  const scenario2NoFiles = buildRunRequestIfValid({
    selectedMode: "established",
    selectedPipelineId: "bulk-rna-seq-v1",
    selectedPipeline: bulkPipeline ?? null,
    selectedFiles: [],
    outputFolder: "/mock/output",
    selectedModifications: {},
    approvedWorkflow: null,
    aiRecommendation: null,
    aiRecommendationApproved: false,
    executionMode: "mock-local",
  });
  logScenarioResult({
    name: "Scenario2 pipeline no files",
    pass: scenario2NoFiles.validation.errors.some((error) => error.code === "files-missing"),
    detail: "contains files-missing",
  });

  const mismatch = validateSelectedFilesAgainstPipeline([{ path: "/mock/matrix.mtx", kind: "matrix" }], bulkPipeline ?? null);
  logScenarioResult({
    name: "Scenario2 wrong file kinds",
    pass: mismatch.errors.some((error) => error.code === "file-kind-mismatch"),
    detail: "contains file-kind-mismatch",
  });

  const scenario2InvalidModification = buildRunRequestIfValid({
    selectedMode: "established",
    selectedPipelineId: "bulk-rna-seq-v1",
    selectedPipeline: bulkPipeline ?? null,
    selectedFiles: bulkFiles,
    outputFolder: null,
    selectedModifications: { "bulk-rna-reference-build": "invalid-option" },
    approvedWorkflow: approvedWorkflow("bulk-rna-seq-v1", bulkWorkflow),
    aiRecommendation: null,
    aiRecommendationApproved: false,
    executionMode: "mock-local",
  });
  logScenarioResult({
    name: "Scenario2 missing output folder",
    pass: scenario2InvalidModification.validation.errors.some((error) => error.code === "output-folder-missing"),
    detail: "contains output-folder-missing",
  });
  logScenarioResult({
    name: "Scenario2 invalid modification option",
    pass: scenario2InvalidModification.validation.errors.some((error) => error.code === "invalid-modification-option"),
    detail: "contains invalid-modification-option",
  });

  const scenario3Recommendation = await recommendWorkflow({
    availablePipelines: getPipelineRegistry(),
    userPrompt: "Need single cell clustering and marker discovery from expression matrix",
  });
  const supported = scenario3Recommendation?.kind === "supported";
  logScenarioResult({
    name: "Scenario3 supported recommendation type",
    pass: supported,
    detail: `kind=${scenario3Recommendation?.kind ?? "null"}`,
  });

  if (scenario3Recommendation?.kind === "supported") {
    logScenarioResult({
      name: "Scenario3 maps to registry",
      pass: Boolean(getPipelineById(scenario3Recommendation.chosenPipelineId)),
      detail: scenario3Recommendation.chosenPipelineId,
    });
    logScenarioResult({
      name: "Scenario3 has typed changes",
      pass: scenario3Recommendation.addedSteps.length > 0 && scenario3Recommendation.modifiedSteps.length > 0,
      detail: `added=${scenario3Recommendation.addedSteps.length}, modified=${scenario3Recommendation.modifiedSteps.length}`,
    });
    logScenarioResult({
      name: "Scenario3 explanations present",
      pass: scenario3Recommendation.explanations.length > 0,
      detail: `count=${scenario3Recommendation.explanations.length}`,
    });

    const aiPipeline = getPipelineById(scenario3Recommendation.chosenPipelineId);
    const aiApprovedWorkflow = approvedWorkflow(scenario3Recommendation.chosenPipelineId, scenario3Recommendation.suggestedWorkflow);
    const aiFiles = [
      { path: "/mock/cells.mtx", kind: "matrix" as const },
      { path: "/mock/cell_meta.csv", kind: "metadata" as const },
    ];

    const scenario3Gated = buildRunRequestIfValid({
      selectedMode: "ai-assisted",
      selectedPipelineId: scenario3Recommendation.chosenPipelineId,
      selectedPipeline: aiPipeline ?? null,
      selectedFiles: aiFiles,
      outputFolder: "/mock/output",
      selectedModifications: scenario3Recommendation.suggestedWorkflow.selectedModifications,
      approvedWorkflow: aiApprovedWorkflow,
      aiRecommendation: scenario3Recommendation,
      aiRecommendationApproved: false,
      executionMode: "mock-local",
    });
    logScenarioResult({
      name: "Scenario3 approval gate blocks forward",
      pass: scenario3Gated.validation.errors.some((error) => error.code === "ai-approval-missing"),
      detail: "ai-approval-missing present",
    });

    const scenario3Approved = buildRunRequestIfValid({
      selectedMode: "ai-assisted",
      selectedPipelineId: scenario3Recommendation.chosenPipelineId,
      selectedPipeline: aiPipeline ?? null,
      selectedFiles: aiFiles,
      outputFolder: "/mock/output",
      selectedModifications: scenario3Recommendation.suggestedWorkflow.selectedModifications,
      approvedWorkflow: aiApprovedWorkflow,
      aiRecommendation: scenario3Recommendation,
      aiRecommendationApproved: true,
      executionMode: "mock-local",
    });
    logScenarioResult({
      name: "Scenario3 run request after approval",
      pass: Boolean(scenario3Approved.runRequest) && scenario3Approved.validation.isValid,
      detail: `errors=${scenario3Approved.validation.errors.length}`,
    });
  }

  const scenario4Recommendation = await recommendWorkflow({
    availablePipelines: getPipelineRegistry(),
    userPrompt: "Need methylation array and metabolomics-only support",
  });
  const unsupported = scenario4Recommendation?.kind === "unsupported";
  logScenarioResult({
    name: "Scenario4 unsupported recommendation type",
    pass: unsupported,
    detail: `kind=${scenario4Recommendation?.kind ?? "null"}`,
  });
  if (scenario4Recommendation?.kind === "unsupported") {
    logScenarioResult({
      name: "Scenario4 typed fallback resources",
      pass: scenario4Recommendation.suggestedResources.length > 0,
      detail: `resources=${scenario4Recommendation.suggestedResources.length}`,
    });
    const scenario4Blocked = buildRunRequestIfValid({
      selectedMode: "ai-assisted",
      selectedPipelineId: null,
      selectedPipeline: null,
      selectedFiles: [],
      outputFolder: null,
      selectedModifications: {},
      approvedWorkflow: null,
      aiRecommendation: scenario4Recommendation,
      aiRecommendationApproved: false,
      executionMode: "mock-local",
    });
    logScenarioResult({
      name: "Scenario4 cannot proceed to run request",
      pass: !scenario4Blocked.runRequest,
      detail: `errors=${scenario4Blocked.validation.errors.length}`,
    });
  }
}

void runVerificationScenarios();
