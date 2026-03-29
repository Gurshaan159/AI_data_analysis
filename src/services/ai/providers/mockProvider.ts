import { buildWorkflowFromPipeline } from "@/domain/workflow/workflowFactory";
import type { AIProviderId } from "@/services/ai/config";
import type { AIProvider, AIRecommendationRequest } from "@/services/ai/types";
import type { AIRecommendationResult, PipelineId, WorkflowStep } from "@/shared/types";

export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;
  constructor(private readonly selectedProvider: AIProviderId) {}

  recommend(request: AIRecommendationRequest): Promise<AIRecommendationResult | null> {
    if (request.availablePipelines.length === 0 || !request.userPrompt.trim()) {
      return Promise.resolve(null);
    }

    const normalizedPrompt = request.userPrompt.toLowerCase();
    const unsupportedTerms = ["methylation array", "protein folding", "metabolomics-only"];
    const shouldReturnUnsupported = unsupportedTerms.some((term) => normalizedPrompt.includes(term));

    if (shouldReturnUnsupported) {
      return Promise.resolve({
        kind: "unsupported",
        recommendationId: `mock-unsupported-${Date.now()}`,
        summary: "No supported workflow matches this request yet.",
        reason: "The request appears outside currently supported pipeline families in this application version.",
        warnings: ["This request is currently out of scope for supported pipelines."],
        assumptions: ["Prompt terms indicate unsupported analysis family."],
        suggestedResources: [
          {
            id: "workflow-scoping",
            title: "Best practices for workflow scoping in omics analysis",
            citation: "Placeholder citation, 2024",
            url: "https://example.org/workflow-scoping",
          },
          {
            id: "methods-review",
            title: "Suggested external methods review",
            citation: "Placeholder citation, 2023",
            url: "https://example.org/methods-review",
          },
        ],
      });
    }

    const keywordToPipeline: Array<{ keyword: string; pipelineId: PipelineId }> = [
      { keyword: "bulk matrix", pipelineId: "bulk-rna-matrix-downstream-v1" },
      { keyword: "single cell", pipelineId: "scrna-seq-v1" },
      { keyword: "scrna", pipelineId: "scrna-seq-v1" },
      { keyword: "atac", pipelineId: "atac-seq-v1" },
      { keyword: "chip", pipelineId: "chip-seq-v1" },
      { keyword: "count matrix", pipelineId: "count-matrix-analysis-v1" },
    ];

    const selectedPipelineId =
      keywordToPipeline.find((item) => normalizedPrompt.includes(item.keyword))?.pipelineId ?? "bulk-rna-seq-v1";
    const best =
      request.availablePipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? request.availablePipelines[0];
    const baseWorkflow = buildWorkflowFromPipeline(best.id);
    if (!baseWorkflow) {
      return Promise.resolve(null);
    }

    const firstStep = baseWorkflow.steps[0];
    const changedParameters = [
      {
        parameterKey: "quality_threshold",
        previousValue: "standard",
        nextValue: "strict",
        summary: "Prompt indicates noisy input, recommending stricter QC.",
      },
    ];

    const modifiedStep: WorkflowStep = firstStep
      ? {
          ...firstStep,
          modifiedByAi: true,
          explanation: `${firstStep.explanation} AI recommendation increases filtering stringency.`,
          parameterChangeSummary: changedParameters,
        }
      : {
          stepId: "ai-qc-review",
          displayLabel: "AI QC Review",
          category: "review",
          required: true,
          addedByAi: false,
          modifiedByAi: true,
          explanation: "AI-adjusted QC review step for prompt-specific risk mitigation.",
          parameterChangeSummary: changedParameters,
          expectedOutputs: ["qc-report"],
        };

    const addedStep: WorkflowStep = {
      stepId: "ai-review-gate",
      displayLabel: "AI Recommendation Review Gate",
      category: "review",
      required: false,
      addedByAi: true,
      modifiedByAi: false,
      explanation: "Explicit user review checkpoint before expensive execution stages.",
      parameterChangeSummary: [],
      expectedOutputs: ["summary-report"],
    };

    const suggestedWorkflow = {
      ...baseWorkflow,
      steps: [modifiedStep, ...baseWorkflow.steps.slice(1), addedStep],
      warnings: ["AI recommendation adds an optional review gate for transparency."],
    };

    return Promise.resolve({
      kind: "supported",
      recommendationId: `mock-${Date.now()}`,
      chosenPipelineId: best.id,
      suggestedWorkflow,
      addedSteps: [addedStep],
      modifiedSteps: [modifiedStep],
      changedParameters,
      explanations: [
        `Prompt mapped to ${best.displayName} using keyword heuristics.`,
        `Mock recommendation from ${this.selectedProvider} provider selection.`,
      ],
      warnings: ["Review AI-modified parameters before workflow approval."],
      assumptions: [
        "Assumes input files map to the selected assay type.",
        "Assumes default quality thresholds are acceptable.",
      ],
      suggestedResources: [
        {
          id: "gene-expression-practices",
          title: "Gene expression workflow best practices",
          citation: "Placeholder citation, 2022",
          url: "https://example.org/gene-expression-practices",
        },
        {
          id: "rnaseq-quality-guide",
          title: "RNA-seq quality metrics interpretation guide",
          citation: "Placeholder citation, 2021",
          url: "https://example.org/rnaseq-quality-guide",
        },
      ],
    });
  }
}
