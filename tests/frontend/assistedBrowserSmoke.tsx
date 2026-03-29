import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import {
  SupportedDecisionPresentation,
  UnsupportedDecisionPresentation,
} from "@/components/workflow/AssistedDecisionPresentation";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { buildPlannerFunctionCatalog } from "@/services/ai/planner/functionCatalog";
import { planWithBoundedCatalog } from "@/services/ai/planner/plannerBoundary";
import { buildAiDecisionSummary } from "@/services/ai/summary/decisionSummaryBuilder";

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

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>");
  const globalAny = globalThis as typeof globalThis & {
    window: Window & typeof globalThis;
    document: Document;
    navigator: Navigator;
    HTMLElement: typeof HTMLElement;
    Node: typeof Node;
    IS_REACT_ACT_ENVIRONMENT: boolean;
  };
  globalAny.window = dom.window as unknown as Window & typeof globalThis;
  globalAny.document = dom.window.document;
  globalAny.HTMLElement = dom.window.HTMLElement;
  globalAny.Node = dom.window.Node;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  globalAny.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

function runSmokeScenario(): ScenarioResult {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);
  const recommendation = planWithBoundedCatalog({
    userPrompt: "I have a count matrix and metadata, and I want differential expression from condition groups.",
    availablePipelines: pipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  if (!recommendation || recommendation.kind !== "supported") {
    return {
      name: "Assisted happy-path browser render",
      pass: false,
      detail: "failed to build supported recommendation fixture",
    };
  }

  const summary = buildAiDecisionSummary(recommendation, pipelines);
  if (summary.kind !== "supported") {
    return {
      name: "Assisted happy-path browser render",
      pass: false,
      detail: "failed to build supported summary fixture",
    };
  }

  const dom = setupDom();
  const container = dom.window.document.getElementById("root");
  if (!container) {
    return {
      name: "Assisted happy-path browser render",
      pass: false,
      detail: "missing root container",
    };
  }

  const root = createRoot(container);
  act(() => {
    root.render(
      <StatusPanel title="Recommended Supported Workflow" tone="success">
        <SupportedDecisionPresentation
          summary={summary}
          recommendation={recommendation}
          approved={false}
          onApprovedChange={() => undefined}
        />
      </StatusPanel>,
    );
  });

  const text = container.textContent ?? "";
  const requiredTokens = [
    "Recommended Supported Workflow",
    "Selected pipeline:",
    summary.chosenPipelineLabel,
    summary.recommendationSummary,
    "What will happen",
    "Review Before Approval",
    "Workflow changes to review",
  ];
  const missing = requiredTokens.filter((token) => !text.includes(token));
  const checkbox = container.querySelector("input[type='checkbox']");
  const workflowSection = container.querySelector(".workflow-diagram");

  act(() => {
    root.unmount();
  });

  const pass = missing.length === 0 && Boolean(checkbox) && Boolean(workflowSection);
  return {
    name: "Assisted happy-path browser render",
    pass,
    detail: pass
      ? "approval summary sections rendered in browser-like DOM"
      : `missingTokens=[${missing.join("; ")}], checkbox=${Boolean(checkbox)}, workflow=${Boolean(workflowSection)}`,
  };
}

function runUnsupportedSmokeScenario(): ScenarioResult {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);
  const recommendation = planWithBoundedCatalog({
    userPrompt: "Need single-cell clustering and marker genes from droplet data.",
    availablePipelines: pipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  if (!recommendation || recommendation.kind !== "unsupported") {
    return {
      name: "Assisted unsupported browser render",
      pass: false,
      detail: "failed to build unsupported recommendation fixture",
    };
  }

  const summary = buildAiDecisionSummary(recommendation, pipelines);
  if (summary.kind !== "unsupported") {
    return {
      name: "Assisted unsupported browser render",
      pass: false,
      detail: "failed to build unsupported summary fixture",
    };
  }

  const dom = setupDom();
  const container = dom.window.document.getElementById("root");
  if (!container) {
    return {
      name: "Assisted unsupported browser render",
      pass: false,
      detail: "missing root container",
    };
  }

  const root = createRoot(container);
  act(() => {
    root.render(
      <StatusPanel title="Unsupported Request" tone="warning">
        <UnsupportedDecisionPresentation summary={summary} />
      </StatusPanel>,
    );
  });

  const text = container.textContent ?? "";
  const requiredTokens = [
    "Unsupported Request",
    summary.title,
    summary.unsupportedSummary,
    summary.unsupportedReasonDetail,
    "What you can do next",
    "Fallback resources",
  ];
  const missing = requiredTokens.filter((token) => !text.includes(token));
  const hasClosestWhenPresent = summary.closestSupportedWorkflowLabel
    ? text.includes("Closest supported workflow:") && text.includes(summary.closestSupportedWorkflowLabel)
    : true;

  act(() => {
    root.render(
      <StatusPanel title="Unsupported Request" tone="warning">
        <UnsupportedDecisionPresentation summary={{ ...summary, closestSupportedWorkflowLabel: null }} />
      </StatusPanel>,
    );
  });
  const textWithoutClosest = container.textContent ?? "";
  const hidesClosestWhenMissing = !textWithoutClosest.includes("Closest supported workflow:");

  act(() => {
    root.unmount();
  });

  const pass = missing.length === 0 && hasClosestWhenPresent && hidesClosestWhenMissing;
  return {
    name: "Assisted unsupported browser render",
    pass,
    detail: pass
      ? "unsupported summary and fallback guidance rendered in browser-like DOM"
      : `missingTokens=[${missing.join("; ")}], closestPresent=${hasClosestWhenPresent}, closestHidden=${hidesClosestWhenMissing}`,
  };
}

function runSparseUnsupportedSmokeScenario(): ScenarioResult {
  const pipelines = getPipelineRegistry();
  const functionCatalog = buildPlannerFunctionCatalog(pipelines);
  const recommendation = planWithBoundedCatalog({
    userPrompt: "Need single-cell clustering and marker genes from droplet data.",
    availablePipelines: pipelines,
    functionCatalog,
    providerLabel: "mock",
  });
  if (!recommendation || recommendation.kind !== "unsupported") {
    return {
      name: "Assisted sparse unsupported browser render",
      pass: false,
      detail: "failed to build unsupported recommendation fixture",
    };
  }

  const summary = buildAiDecisionSummary(recommendation, pipelines);
  if (summary.kind !== "unsupported") {
    return {
      name: "Assisted sparse unsupported browser render",
      pass: false,
      detail: "failed to build unsupported summary fixture",
    };
  }

  const sparseSummary = {
    ...summary,
    closestSupportedWorkflowLabel: null,
    fallbackResources: [],
    nextStepSuggestions: [summary.nextStepSuggestions[0] ?? "Reframe to a supported workflow."],
  };

  const dom = setupDom();
  const container = dom.window.document.getElementById("root");
  if (!container) {
    return {
      name: "Assisted sparse unsupported browser render",
      pass: false,
      detail: "missing root container",
    };
  }

  const root = createRoot(container);
  act(() => {
    root.render(
      <StatusPanel title="Unsupported Request" tone="warning">
        <UnsupportedDecisionPresentation summary={sparseSummary} />
      </StatusPanel>,
    );
  });

  const text = container.textContent ?? "";
  const requiredTokens = [
    "Unsupported Request",
    sparseSummary.title,
    sparseSummary.unsupportedSummary,
    sparseSummary.unsupportedReasonDetail,
    "What you can do next",
    "Fallback resources",
    sparseSummary.nextStepSuggestions[0],
  ];
  const missing = requiredTokens.filter((token) => !text.includes(token));
  const hidesClosestWhenMissing = !text.includes("Closest supported workflow:");
  const hasNoPlaceholderJunk = !text.includes("undefined") && !text.includes("null");

  act(() => {
    root.unmount();
  });

  const pass = missing.length === 0 && hidesClosestWhenMissing && hasNoPlaceholderJunk;
  return {
    name: "Assisted sparse unsupported browser render",
    pass,
    detail: pass
      ? "sparse unsupported summary renders without broken placeholders"
      : `missingTokens=[${missing.join("; ")}], closestHidden=${hidesClosestWhenMissing}, cleanText=${hasNoPlaceholderJunk}`,
  };
}

function runAll() {
  const results = [runSmokeScenario(), runUnsupportedSmokeScenario(), runSparseUnsupportedSmokeScenario()];
  results.forEach(logScenarioResult);
  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    throw new Error(`FAILED SCENARIOS: ${failed.length}/${results.length}`);
  }
  // eslint-disable-next-line no-console
  console.log(`ALL SCENARIOS PASSED: ${results.length}/${results.length}`);
}

runAll();
