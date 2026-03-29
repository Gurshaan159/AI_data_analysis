import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalChecklist } from "@/components/workflow/ApprovalChecklist";
import {
  SupportedDecisionPresentation,
  UnsupportedDecisionPresentation,
} from "@/components/workflow/AssistedDecisionPresentation";
import { RecommendationAdjustments } from "@/components/workflow/RecommendationAdjustments";
import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import { buildAiDecisionSummary } from "@/services/ai/summary/decisionSummaryBuilder";
import type {
  SupportedDecisionSummary,
  SupportedRecommendationResult,
  UnsupportedDecisionSummary,
  WorkflowStep,
} from "@/shared/types";

interface ScenarioResult {
  name: string;
  pass: boolean;
  detail: string;
}

function logScenarioResult(result: ScenarioResult): void {
  const status = result.pass ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`${status} | ${result.name} | ${result.detail}`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getSupportedRecommendation(prompt: string): SupportedRecommendationResult {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);
  const recommendation = planWithBoundedCatalog({
    userPrompt: prompt,
    availablePipelines: pipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  if (!recommendation || recommendation.kind !== "supported") {
    throw new Error(`Expected supported recommendation for prompt: ${prompt}`);
  }
  return recommendation;
}

function getUnsupportedSummary(prompt: string): UnsupportedDecisionSummary {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);
  const recommendation = planWithBoundedCatalog({
    userPrompt: prompt,
    availablePipelines: pipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  if (!recommendation || recommendation.kind !== "unsupported") {
    throw new Error(`Expected unsupported recommendation for prompt: ${prompt}`);
  }
  const summary = buildAiDecisionSummary(recommendation, pipelines);
  if (summary.kind !== "unsupported") {
    throw new Error("Expected unsupported decision summary.");
  }
  return summary;
}

function getSupportedSummary(recommendation: SupportedRecommendationResult): SupportedDecisionSummary {
  const summary = buildAiDecisionSummary(recommendation, getPipelineRegistry());
  if (summary.kind !== "supported") {
    throw new Error("Expected supported decision summary.");
  }
  return summary;
}

function createSyntheticStep(base: WorkflowStep, patch: Partial<WorkflowStep>): WorkflowStep {
  return {
    ...base,
    ...patch,
    parameterChangeSummary: patch.parameterChangeSummary ?? base.parameterChangeSummary,
    expectedOutputs: patch.expectedOutputs ?? base.expectedOutputs,
  };
}

function runScenario(name: string, markup: string, mustInclude: string[], mustNotInclude: string[] = []): ScenarioResult {
  const missing = mustInclude.filter((token) => !markup.includes(token));
  const unexpected = mustNotInclude.filter((token) => markup.includes(token));
  const pass = missing.length === 0 && unexpected.length === 0;
  const detail = pass
    ? "all required UI tokens present"
    : `missing=[${missing.join("; ")}] unexpected=[${unexpected.join("; ")}]`;
  return { name, pass, detail };
}

function runAll() {
  const countRecommendation = getSupportedRecommendation(
    "I have a count matrix and metadata, and I want differential expression from condition groups.",
  );
  const countSummary = getSupportedSummary(countRecommendation);

  const bulkRecommendation = getSupportedRecommendation(
    "Bulk RNA matrix with metadata and treatment/control groups; include PCA and volcano plot.",
  );
  const bulkSummary = getSupportedSummary(bulkRecommendation);

  const supportedMarkup = renderToStaticMarkup(
    <SupportedDecisionPresentation
      summary={countSummary}
      recommendation={countRecommendation}
      approved={false}
      onApprovedChange={() => undefined}
    />,
  );
  const bulkMarkup = renderToStaticMarkup(
    <SupportedDecisionPresentation
      summary={bulkSummary}
      recommendation={bulkRecommendation}
      approved={false}
      onApprovedChange={() => undefined}
    />,
  );

  const unsupportedSummary = getUnsupportedSummary("Need single-cell clustering and marker genes from droplet data.");
  const unsupportedMarkup = renderToStaticMarkup(<UnsupportedDecisionPresentation summary={unsupportedSummary} />);
  const unsupportedNoClosestMarkup = renderToStaticMarkup(
    <UnsupportedDecisionPresentation summary={{ ...unsupportedSummary, closestSupportedWorkflowLabel: null }} />,
  );

  const emptyAssumptionWarningSummary: SupportedDecisionSummary = {
    ...countSummary,
    assumptionsToReview: [],
    warningsToReview: [],
  };
  const emptyAssumptionWarningMarkup = renderToStaticMarkup(
    <SupportedDecisionPresentation
      summary={emptyAssumptionWarningSummary}
      recommendation={countRecommendation}
      approved={false}
      onApprovedChange={() => undefined}
    />,
  );

  const baseSteps = clone(countRecommendation.workflowProposal.steps);
  const syntheticRecommendation = clone(countRecommendation);
  syntheticRecommendation.addedSteps = [
    createSyntheticStep(baseSteps[0], {
      stepId: "synthetic-added-step",
      displayLabel: "Synthetic Added Step",
      addedByAi: true,
      modifiedByAi: false,
      skippedByAi: false,
    }),
  ];
  syntheticRecommendation.modifiedSteps = [
    createSyntheticStep(baseSteps[1], {
      stepId: "synthetic-modified-step",
      displayLabel: "Synthetic Modified Step",
      addedByAi: false,
      modifiedByAi: true,
      skippedByAi: false,
    }),
  ];
  syntheticRecommendation.skippedSteps = [
    createSyntheticStep(baseSteps[2], {
      stepId: "synthetic-skipped-step",
      displayLabel: "Synthetic Skipped Step",
      required: false,
      addedByAi: false,
      modifiedByAi: true,
      skippedByAi: true,
    }),
  ];
  const adjustmentMarkup = renderToStaticMarkup(<RecommendationAdjustments recommendation={syntheticRecommendation} />);

  const checklistItems = [
    "Confirm pipeline and intent alignment.",
    "Confirm matrix and metadata assumptions.",
    "Confirm warnings were reviewed.",
  ];
  const checklistMarkup = renderToStaticMarkup(<ApprovalChecklist items={checklistItems} />);

  const checklistOrderPass =
    checklistMarkup.indexOf(checklistItems[0]) <
      checklistMarkup.indexOf(checklistItems[1]) &&
    checklistMarkup.indexOf(checklistItems[1]) < checklistMarkup.indexOf(checklistItems[2]);

  const results: ScenarioResult[] = [
    runScenario(
      "Supported count-matrix recommendation UI blocks render correctly",
      supportedMarkup,
      [
        "Selected pipeline:",
        "Count-Matrix Analysis",
        "What will happen",
        "Assumptions",
        "Warnings",
        "Review Before Approval",
      ],
    ),
    runScenario(
      "Supported bulk RNA matrix + DE recommendation UI blocks render correctly",
      bulkMarkup,
      [
        "Bulk RNA-seq (Matrix Downstream)",
        "Run Bulk RNA Normalization and PCA.",
        "Planner explanations",
      ],
    ),
    runScenario(
      "Assumptions and warnings render correctly when absent",
      emptyAssumptionWarningMarkup,
      ["No additional assumptions were introduced.", "No blocking warnings detected."],
      [countSummary.assumptionsToReview[0], countSummary.warningsToReview[0]],
    ),
    runScenario(
      "Added/skipped/modified workflow adjustment items render clearly",
      adjustmentMarkup,
      ["1 added", "1 modified", "1 skipped", "Synthetic Added Step", "Synthetic Modified Step", "Synthetic Skipped Step"],
    ),
    {
      name: "Approval checklist renders in stable order",
      pass: checklistOrderPass,
      detail: checklistOrderPass ? "checklist items preserve expected order" : "checklist item order mismatch",
    },
    runScenario(
      "Unsupported summary rendering remains stable with closest workflow",
      unsupportedMarkup,
      ["Unsupported Request Summary", "What you can do next", "Fallback resources", "Closest supported workflow:"],
    ),
    runScenario(
      "Unsupported summary handles missing closest workflow label",
      unsupportedNoClosestMarkup,
      ["Unsupported Request Summary", "What you can do next"],
      ["Closest supported workflow:"],
    ),
  ];

  results.forEach(logScenarioResult);
  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    throw new Error(`FAILED SCENARIOS: ${failed.length}/${results.length}`);
  }
  // eslint-disable-next-line no-console
  console.log(`ALL SCENARIOS PASSED: ${results.length}/${results.length}`);
}

runAll();
