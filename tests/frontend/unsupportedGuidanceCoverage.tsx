import { renderToStaticMarkup } from "react-dom/server";

import {
  DEFAULT_UNSUPPORTED_NEXT_STEP_SUGGESTION,
  UnsupportedDecisionPresentation,
} from "@/components/workflow/AssistedDecisionPresentation";
import type { UnsupportedDecisionSummary } from "@/shared/types";

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

function runScenario(name: string, markup: string, mustInclude: string[], mustNotInclude: string[] = []): ScenarioResult {
  const missing = mustInclude.filter((token) => !markup.includes(token));
  const unexpected = mustNotInclude.filter((token) => markup.includes(token));
  const pass = missing.length === 0 && unexpected.length === 0;
  const detail = pass
    ? "unsupported guidance rendered as expected"
    : `missing=[${missing.join("; ")}] unexpected=[${unexpected.join("; ")}]`;
  return { name, pass, detail };
}

const baseUnsupportedSummary: UnsupportedDecisionSummary = {
  kind: "unsupported",
  title: "Unsupported Request Summary",
  unsupportedSummary: "The request cannot be planned with currently supported workflows.",
  unsupportedReasonDetail: "Current support is limited to count-matrix and bulk RNA matrix workflows.",
  closestSupportedWorkflowLabel: "Count-Matrix Analysis",
  nextStepSuggestions: ["Reframe to a supported workflow."],
  fallbackResources: [],
};

function runAll() {
  const populatedSummary: UnsupportedDecisionSummary = {
    ...baseUnsupportedSummary,
    nextStepSuggestions: [
      "Review your input description and try a supported matrix-based workflow.",
      "Include matrix and metadata context, then try again.",
    ],
  };
  const emptySummary: UnsupportedDecisionSummary = {
    ...baseUnsupportedSummary,
    nextStepSuggestions: [],
  };

  const { nextStepSuggestions: _omittedNextSteps, ...missingSuggestionsShape } = baseUnsupportedSummary;
  const missingSummary = missingSuggestionsShape as unknown as UnsupportedDecisionSummary;

  const populatedMarkup = renderToStaticMarkup(<UnsupportedDecisionPresentation summary={populatedSummary} />);
  const emptyMarkup = renderToStaticMarkup(<UnsupportedDecisionPresentation summary={emptySummary} />);
  const missingMarkup = renderToStaticMarkup(<UnsupportedDecisionPresentation summary={missingSummary} />);

  const reasonTokens = [baseUnsupportedSummary.title, baseUnsupportedSummary.unsupportedSummary, baseUnsupportedSummary.unsupportedReasonDetail];
  const results: ScenarioResult[] = [
    runScenario(
      "Unsupported guidance renders populated next-step suggestions",
      populatedMarkup,
      [
        ...reasonTokens,
        populatedSummary.nextStepSuggestions[0],
        populatedSummary.nextStepSuggestions[1],
        "What you can do next",
      ],
      [DEFAULT_UNSUPPORTED_NEXT_STEP_SUGGESTION],
    ),
    runScenario(
      "Unsupported guidance renders fallback for empty next-step suggestions",
      emptyMarkup,
      [...reasonTokens, "What you can do next", DEFAULT_UNSUPPORTED_NEXT_STEP_SUGGESTION],
    ),
    runScenario(
      "Unsupported guidance renders fallback when next-step suggestions are missing",
      missingMarkup,
      [...reasonTokens, "What you can do next", DEFAULT_UNSUPPORTED_NEXT_STEP_SUGGESTION],
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
