import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import { buildAiDecisionSummary } from "@/services/ai/summary/decisionSummaryBuilder";
import type { AIRecommendationResult } from "@/shared/types";

interface ScenarioResult {
  name: string;
  pass: boolean;
  detail: string;
}

interface SummaryFixture {
  name: string;
  prompt: string;
  expectedKind: "supported" | "unsupported";
  expectedPipelineLabelIncludes?: string;
  expectedReasonIncludes?: string;
  expectedActionIncludes?: string;
  minKeyReasons?: number;
  minPlannedActions?: number;
  minWarnings?: number;
  minAssumptions?: number;
  requireNextStepGuidance?: boolean;
  requireClosestSupportedLabel?: boolean;
}

function logScenarioResult(result: ScenarioResult): void {
  const status = result.pass ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`${status} | ${result.name} | ${result.detail}`);
}

function getRecommendation(prompt: string): AIRecommendationResult | null {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);
  return planWithBoundedCatalog({
    userPrompt: prompt,
    availablePipelines: pipelines,
    functionCatalog,
    providerLabel: "mock",
  });
}

const fixtures: SummaryFixture[] = [
  {
    name: "Supported count-matrix recommendation produces supported summary",
    prompt: "I have a count matrix and metadata, and I want differential expression from condition groups.",
    expectedKind: "supported",
    expectedPipelineLabelIncludes: "Count-Matrix",
    expectedActionIncludes: "Run",
    minKeyReasons: 1,
    minPlannedActions: 2,
    minWarnings: 1,
    minAssumptions: 1,
  },
  {
    name: "Supported bulk matrix recommendation produces clear summary",
    prompt: "Bulk RNA matrix with metadata and treatment/control groups; include PCA and volcano plot.",
    expectedKind: "supported",
    expectedPipelineLabelIncludes: "Bulk RNA-seq (Matrix Downstream)",
    expectedActionIncludes: "Run Bulk RNA Normalization and PCA.",
    minKeyReasons: 1,
    minPlannedActions: 2,
    minWarnings: 1,
    minAssumptions: 1,
  },
  {
    name: "Supported ambiguous recommendation surfaces warning review content",
    prompt: "I have my data, what analysis should I run?",
    expectedKind: "supported",
    expectedPipelineLabelIncludes: "Count-Matrix",
    minWarnings: 1,
    minAssumptions: 1,
  },
  {
    name: "Unsupported recommendation produces unsupported summary",
    prompt: "Need single-cell clustering and marker genes from droplet data.",
    expectedKind: "unsupported",
    expectedReasonIncludes: "supports only count-matrix and bulk-RNA matrix-downstream workflows",
    requireNextStepGuidance: true,
    requireClosestSupportedLabel: true,
  },
];

function runSummaryFixtures(): ScenarioResult[] {
  const pipelines = getPipelineRegistry();
  return fixtures.map((fixture) => {
    const recommendation = getRecommendation(fixture.prompt);
    if (!recommendation) {
      return { name: fixture.name, pass: false, detail: "planner returned null recommendation" };
    }
    const summary = buildAiDecisionSummary(recommendation, pipelines);
    if (summary.kind !== fixture.expectedKind) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected kind=${fixture.expectedKind}, actual=${summary.kind}`,
      };
    }
    if (
      summary.kind === "supported" &&
      fixture.expectedPipelineLabelIncludes &&
      !summary.chosenPipelineLabel.includes(fixture.expectedPipelineLabelIncludes)
    ) {
      return {
        name: fixture.name,
        pass: false,
        detail: `pipeline label mismatch: ${summary.chosenPipelineLabel}`,
      };
    }
    if (
      summary.kind === "supported" &&
      fixture.expectedActionIncludes &&
      !summary.keyPlannedActions.some((action) => action.includes(fixture.expectedActionIncludes ?? ""))
    ) {
      return {
        name: fixture.name,
        pass: false,
        detail: `planned actions missing token '${fixture.expectedActionIncludes}'`,
      };
    }
    if (summary.kind === "supported" && fixture.minKeyReasons && summary.keyReasons.length < fixture.minKeyReasons) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected at least ${fixture.minKeyReasons} key reasons, got ${summary.keyReasons.length}`,
      };
    }
    if (summary.kind === "supported" && fixture.minPlannedActions && summary.keyPlannedActions.length < fixture.minPlannedActions) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected at least ${fixture.minPlannedActions} planned actions, got ${summary.keyPlannedActions.length}`,
      };
    }
    if (summary.kind === "supported" && fixture.minWarnings && summary.warningsToReview.length < fixture.minWarnings) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected at least ${fixture.minWarnings} warnings, got ${summary.warningsToReview.length}`,
      };
    }
    if (summary.kind === "supported" && fixture.minAssumptions && summary.assumptionsToReview.length < fixture.minAssumptions) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected at least ${fixture.minAssumptions} assumptions, got ${summary.assumptionsToReview.length}`,
      };
    }
    if (
      summary.kind === "unsupported" &&
      fixture.expectedReasonIncludes &&
      !summary.unsupportedReasonDetail.includes(fixture.expectedReasonIncludes)
    ) {
      return {
        name: fixture.name,
        pass: false,
        detail: `unsupported reason mismatch: ${summary.unsupportedReasonDetail}`,
      };
    }
    if (summary.kind === "unsupported" && fixture.requireNextStepGuidance && summary.nextStepSuggestions.length === 0) {
      return {
        name: fixture.name,
        pass: false,
        detail: "expected next-step guidance, found none",
      };
    }
    if (summary.kind === "unsupported" && fixture.requireClosestSupportedLabel && summary.closestSupportedWorkflowLabel === null) {
      return {
        name: fixture.name,
        pass: false,
        detail: "expected closest supported workflow label, found null",
      };
    }
    return {
      name: fixture.name,
      pass: true,
      detail: summary.kind === "supported" ? summary.chosenPipelineLabel : summary.unsupportedSummary,
    };
  });
}

function runFutureProviderCompatibilityCheck(): ScenarioResult {
  const pipelines = getPipelineRegistry();
  const syntheticUnsupported: AIRecommendationResult = {
    kind: "unsupported",
    recommendationId: "lava-like-synthetic",
    unsupportedReasonCode: "outside-supported-universe",
    summary: "Synthetic external provider fallback",
    reason: "External provider returned bounded unsupported output.",
    closestSupportedPipelineId: "count-matrix-analysis-v1",
    plannerFunctionCalls: [
      {
        functionId: "detect_unsupported_request",
        arguments: {
          reasonCode: "outside-supported-universe",
          reason: "Synthetic fallback reason",
        },
      },
    ],
    explanations: [
      {
        id: "synthetic-fallback",
        kind: "fallback",
        title: "Fallback",
        detail: "Synthetic fallback explanation",
        sourceFunctionId: "detect_unsupported_request",
      },
    ],
    warnings: [],
    assumptions: [],
    suggestedResources: [
      {
        id: "synthetic-resource",
        title: "Scope note",
        description: "Synthetic resource item",
        resourceType: "scope-note",
      },
    ],
  };

  const summary = buildAiDecisionSummary(syntheticUnsupported, pipelines);
  const pass = summary.kind === "unsupported" && summary.closestSupportedWorkflowLabel !== null;
  return {
    name: "Future provider-style unsupported payload uses same summary builder",
    pass,
    detail: summary.kind === "unsupported" ? summary.closestSupportedWorkflowLabel ?? "null" : "unexpected supported summary",
  };
}

function runAll() {
  const results = [...runSummaryFixtures(), runFutureProviderCompatibilityCheck()];
  results.forEach(logScenarioResult);
  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    throw new Error(`FAILED SCENARIOS: ${failed.length}/${results.length}`);
  }
  // eslint-disable-next-line no-console
  console.log(`ALL SCENARIOS PASSED: ${results.length}/${results.length}`);
}

runAll();
