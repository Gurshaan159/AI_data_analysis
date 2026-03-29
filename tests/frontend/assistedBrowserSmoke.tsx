import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { SupportedDecisionPresentation } from "@/components/workflow/AssistedDecisionPresentation";
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

function runAll() {
  const result = runSmokeScenario();
  logScenarioResult(result);
  if (!result.pass) {
    throw new Error("FAILED SCENARIOS: 1/1");
  }
  // eslint-disable-next-line no-console
  console.log("ALL SCENARIOS PASSED: 1/1");
}

runAll();
