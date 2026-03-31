import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { extractPlannerIntentSignals } from "@/services/ai/intent/intentExtractor";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import type { PlannerIntentSignals } from "@/shared/types";

interface ScenarioResult {
  name: string;
  pass: boolean;
  detail: string;
}

type PartialSignals = {
  [K in keyof PlannerIntentSignals]?: Partial<PlannerIntentSignals[K]>;
};

interface IntentFixture {
  name: string;
  prompt: string;
  expected: PartialSignals;
  notes?: string;
}

interface PlannerFixture {
  name: string;
  prompt: string;
  expectedKind: "supported" | "unsupported";
  expectedPipelineId?: "count-matrix-analysis-v1" | "bulk-rna-matrix-downstream-v1";
  expectedUnsupportedReason?: string;
}

function logScenarioResult(result: ScenarioResult): void {
  const status = result.pass ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`${status} | ${result.name} | ${result.detail}`);
}

function getExpectedMismatches(expected: PartialSignals, actual: PlannerIntentSignals): string[] {
  const mismatches: string[] = [];
  (Object.keys(expected) as Array<keyof PartialSignals>).forEach((groupKey) => {
    const expectedGroup = expected[groupKey];
    if (!expectedGroup) {
      return;
    }
    const actualGroup = actual[groupKey];
    (Object.keys(expectedGroup) as string[]).forEach((signalKey) => {
      const expectedValue = (expectedGroup as Record<string, boolean>)[signalKey];
      const actualValue = (actualGroup as Record<string, boolean>)[signalKey];
      if (expectedValue !== actualValue) {
        mismatches.push(`${String(groupKey)}.${signalKey}: expected=${expectedValue} actual=${actualValue}`);
      }
    });
  });
  return mismatches;
}

const intentFixtures: IntentFixture[] = [
  {
    name: "Matrix prompt with metadata and PCA intent",
    prompt: "I have a count matrix with sample sheet metadata and want normalization plus PCA.",
    expected: {
      dataCharacteristics: {
        hasMatrixData: true,
        hasMetadata: true,
        expectsNormalization: true,
        expectsDimensionalityReduction: true,
      },
      desiredOutputs: {
        wantsPca: true,
      },
      constraints: {
        unsupportedAnalysisRequested: false,
      },
    },
  },
  {
    name: "Group comparison prompt enables DE intent",
    prompt: "Compare treatment vs control conditions and find differential expression from matrix data.",
    expected: {
      dataCharacteristics: {
        hasMatrixData: true,
        expectsGroupComparison: true,
      },
      desiredOutputs: {
        wantsDifferentialExpression: true,
      },
      problemFraming: {
        wantsComparisonBetweenConditions: true,
      },
    },
  },
  {
    name: "Vague help-me-choose prompt stays recommendation-friendly",
    prompt: "I have my data, what analysis should I run?",
    expected: {
      problemFraming: {
        wantsRecommendation: true,
        unsureWhatAnalysisToRun: true,
        wantsBasicAnalysis: true,
      },
      constraints: {
        ambiguousInputDescription: true,
        unsupportedAnalysisRequested: false,
      },
    },
  },
  {
    name: "Unsupported single-cell prompt is flagged unsupported",
    prompt: "Need single-cell clustering and marker genes.",
    expected: {
      constraints: {
        unsupportedAnalysisRequested: true,
      },
    },
  },
  {
    name: "Unsupported spatial transcriptomics prompt is flagged unsupported",
    prompt: "Can you run spatial transcriptomics analysis with spot-level deconvolution?",
    expected: {
      constraints: {
        unsupportedAnalysisRequested: true,
      },
    },
  },
  {
    name: "Unsupported peak-calling prompt is flagged unsupported",
    prompt: "Please do peak calling for my chromatin assay.",
    expected: {
      constraints: {
        unsupportedAnalysisRequested: true,
      },
    },
  },
  {
    name: "Unsupported raw FASTQ alignment prompt is flagged unsupported",
    prompt: "I have raw FASTQ reads and need alignment before downstream analysis.",
    expected: {
      constraints: {
        unsupportedAnalysisRequested: true,
      },
    },
  },
  {
    name: "FASTQ files phrasing is flagged unsupported (bounded universe)",
    prompt: "I have FASTQ files and want a full RNA-seq pipeline.",
    expected: {
      constraints: {
        unsupportedAnalysisRequested: true,
      },
    },
  },
  {
    name: "Ambiguous supportable matrix wording stays supported-oriented",
    prompt: "I have an expression matrix and need to compare groups with a clean visualization summary.",
    expected: {
      dataCharacteristics: {
        hasMatrixData: true,
        expectsVisualization: true,
      },
      problemFraming: {
        wantsComparisonBetweenConditions: true,
      },
      constraints: {
        unsupportedAnalysisRequested: false,
      },
    },
    notes: "Groups imply comparison without naming metadata columns explicitly.",
  },
];

const plannerFixtures: PlannerFixture[] = [
  {
    name: "Stable count-matrix planning path",
    prompt: "I have a count matrix and metadata, and I want differential expression from condition groups.",
    expectedKind: "supported",
    expectedPipelineId: "count-matrix-analysis-v1",
  },
  {
    name: "Stable bulk-rna downstream planning path",
    prompt: "Bulk RNA matrix with metadata and treatment/control groups; include PCA and volcano plot.",
    expectedKind: "supported",
    expectedPipelineId: "bulk-rna-matrix-downstream-v1",
  },
  {
    name: "Unsupported request remains unsupported in planner",
    prompt: "Need single-cell clustering and marker genes from droplet data.",
    expectedKind: "unsupported",
    expectedUnsupportedReason: "outside-supported-universe",
  },
  {
    name: "FASTQ pipeline request stays unsupported in bounded planner",
    prompt: "I have FASTQ files and want a full RNA-seq pipeline.",
    expectedKind: "unsupported",
    expectedUnsupportedReason: "outside-supported-universe",
  },
  {
    name: "Vague recommendation prompt remains supported by bounded planner",
    prompt: "Can you recommend the right workflow? I am not sure what to run.",
    expectedKind: "supported",
    expectedPipelineId: "count-matrix-analysis-v1",
  },
];

function runIntentFixtures(): ScenarioResult[] {
  return intentFixtures.map((fixture) => {
    const extracted = extractPlannerIntentSignals(fixture.prompt);
    const mismatches = getExpectedMismatches(fixture.expected, extracted.signals);
    return {
      name: fixture.name,
      pass: mismatches.length === 0,
      detail:
        mismatches.length === 0
          ? fixture.notes ?? "expected intent signals matched"
          : `${mismatches.join(" | ")}${fixture.notes ? ` | note=${fixture.notes}` : ""}`,
    };
  });
}

function runPlannerFixtures(): ScenarioResult[] {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);
  return plannerFixtures.map((fixture) => {
    const result = planWithBoundedCatalog({
      userPrompt: fixture.prompt,
      availablePipelines: pipelines,
      functionCatalog,
      providerLabel: "mock",
    });
    if (!result) {
      return {
        name: fixture.name,
        pass: false,
        detail: "planner returned null",
      };
    }
    if (result.kind !== fixture.expectedKind) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected kind=${fixture.expectedKind}, actual=${result.kind}`,
      };
    }
    if (
      fixture.expectedKind === "supported" &&
      result.kind === "supported" &&
      fixture.expectedPipelineId &&
      result.chosenPipelineId !== fixture.expectedPipelineId
    ) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected pipeline=${fixture.expectedPipelineId}, actual=${result.chosenPipelineId}`,
      };
    }
    if (
      fixture.expectedKind === "unsupported" &&
      result.kind === "unsupported" &&
      fixture.expectedUnsupportedReason &&
      result.unsupportedReasonCode !== fixture.expectedUnsupportedReason
    ) {
      return {
        name: fixture.name,
        pass: false,
        detail: `expected reason=${fixture.expectedUnsupportedReason}, actual=${result.unsupportedReasonCode}`,
      };
    }
    return {
      name: fixture.name,
      pass: true,
      detail:
        fixture.expectedKind === "supported" && result.kind === "supported"
          ? `pipeline=${result.chosenPipelineId}`
          : fixture.expectedKind === "unsupported" && result.kind === "unsupported"
            ? `reason=${result.unsupportedReasonCode}`
            : "kind matched",
    };
  });
}

function runAll() {
  const results = [...runIntentFixtures(), ...runPlannerFixtures()];
  results.forEach(logScenarioResult);
  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    throw new Error(`FAILED SCENARIOS: ${failed.length}/${results.length}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`ALL SCENARIOS PASSED: ${results.length}/${results.length}`);
  }
}

runAll();
