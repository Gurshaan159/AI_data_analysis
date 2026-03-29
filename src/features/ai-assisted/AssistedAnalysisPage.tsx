import { useState } from "react";

import { APP_PAGES } from "@/app/routes";
import {
  SupportedDecisionPresentation,
  UnsupportedDecisionPresentation,
} from "@/components/workflow/AssistedDecisionPresentation";
import { PageShell } from "@/components/ui/PageShell";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { buildApprovedAiWorkflowHandoff } from "@/domain/ai/approvalHandoff";
import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { recommendWorkflow } from "@/services/ai/recommendationService";
import { buildAiDecisionSummary } from "@/services/ai/summary/decisionSummaryBuilder";
import { useAppState } from "@/state/useAppState";

const EXAMPLE_PROMPTS = [
  "I have paired-end bulk RNA-seq files for treatment vs control differential expression.",
  "I am analyzing single-cell libraries and need clustering plus marker genes.",
  "I have a count matrix and metadata and need statistical contrasts.",
];

export function AssistedAnalysisPage() {
  const { state, dispatch } = useAppState();
  const [isLoading, setIsLoading] = useState(false);

  async function getRecommendation() {
    if (!state.aiPrompt.trim()) {
      return;
    }
    setIsLoading(true);
    dispatch({ type: "set-backend-error", error: null });
    dispatch({ type: "set-ai-recommendation-status", status: "loading" });
    const availablePipelines = getPipelineRegistry();
    const recommendation = await recommendWorkflow({
      availablePipelines,
      userPrompt: state.aiPrompt,
    });
    dispatch({ type: "set-ai-recommendation", recommendation });

    if (recommendation?.kind === "supported") {
      dispatch({ type: "set-ai-recommendation-status", status: "supported" });
      dispatch({ type: "select-pipeline", pipelineId: null });
      dispatch({ type: "set-ai-recommendation-approved", approved: false });
    } else if (recommendation?.kind === "unsupported") {
      dispatch({ type: "set-ai-recommendation-status", status: "unsupported" });
      dispatch({ type: "select-pipeline", pipelineId: null });
      dispatch({ type: "set-ai-recommendation-approved", approved: false });
    } else {
      dispatch({ type: "set-ai-recommendation-status", status: "error" });
    }
    setIsLoading(false);
  }

  function rejectRecommendation() {
    dispatch({ type: "set-ai-recommendation", recommendation: null });
    dispatch({ type: "set-ai-recommendation-status", status: "idle" });
    dispatch({ type: "select-pipeline", pipelineId: null });
    dispatch({ type: "set-ai-recommendation-approved", approved: false });
    dispatch({ type: "set-backend-error", error: null });
  }

  function approveRecommendationAndContinue() {
    if (state.aiRecommendation?.kind !== "supported") {
      return;
    }
    const handoff = buildApprovedAiWorkflowHandoff(state.aiRecommendation);
    if (!handoff.ok) {
      dispatch({ type: "set-backend-error", error: handoff.error });
      return;
    }
    dispatch({ type: "set-backend-error", error: null });
    dispatch({ type: "apply-ai-workflow-handoff", handoff: handoff.value });
    dispatch({ type: "set-page", page: APP_PAGES.REVIEW_WORKFLOW });
  }

  const availablePipelines = getPipelineRegistry();
  const supportedRecommendation = state.aiRecommendation?.kind === "supported" ? state.aiRecommendation : null;
  const decisionSummary = state.aiRecommendation ? buildAiDecisionSummary(state.aiRecommendation, availablePipelines) : null;
  const supportedSummary = decisionSummary?.kind === "supported" ? decisionSummary : null;
  const unsupportedSummary = decisionSummary?.kind === "unsupported" ? decisionSummary : null;

  return (
    <PageShell
      title="AI-Assisted Analysis"
      description="Describe your data and goals. AI can propose a supported workflow for your approval."
    >
      <div className="stack">
        <label htmlFor="ai-prompt">Describe your dataset and question</label>
        <textarea
          id="ai-prompt"
          className="prompt-box"
          value={state.aiPrompt}
          onChange={(event) => dispatch({ type: "set-ai-prompt", prompt: event.currentTarget.value })}
          placeholder="Example: paired-end bulk RNA-seq with treatment/control groups..."
          rows={6}
        />
        <div>
          <strong>Example prompts</strong>
          <ul>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  className="linkish-button"
                  onClick={() => dispatch({ type: "set-ai-prompt", prompt })}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => {
            void getRecommendation();
          }}
          disabled={isLoading || !state.aiPrompt.trim()}
        >
          {isLoading ? "Generating recommendation..." : "Generate Recommendation"}
        </button>
      </div>

      {state.aiRecommendationStatus === "loading" ? (
        <StatusPanel title="Recommendation in progress" tone="neutral">
          <p>Analyzing your prompt and mapping to supported workflows...</p>
        </StatusPanel>
      ) : null}

      {supportedRecommendation && supportedSummary ? (
        <StatusPanel title="Recommended Supported Workflow" tone="success">
          <SupportedDecisionPresentation
            summary={supportedSummary}
            recommendation={supportedRecommendation}
            approved={state.aiRecommendationApproved}
            onApprovedChange={(approved) => dispatch({ type: "set-ai-recommendation-approved", approved })}
          />
        </StatusPanel>
      ) : null}

      {state.aiRecommendation?.kind === "unsupported" && unsupportedSummary ? (
        <StatusPanel title="Unsupported Request" tone="warning">
          <UnsupportedDecisionPresentation summary={unsupportedSummary} />
        </StatusPanel>
      ) : null}

      {state.backendError ? (
        <StatusPanel title="Approval Handoff Error" tone="warning">
          <p>{state.backendError}</p>
        </StatusPanel>
      ) : null}

      <div className="button-row">
        <button type="button" onClick={() => dispatch({ type: "set-page", page: APP_PAGES.WELCOME })}>
          Back
        </button>
        <button type="button" onClick={rejectRecommendation}>
          Reject Recommendation
        </button>
        <button
          type="button"
          disabled={!supportedRecommendation || !supportedSummary || !state.aiRecommendationApproved}
          onClick={approveRecommendationAndContinue}
        >
          Approve Recommendation and Continue
        </button>
      </div>
    </PageShell>
  );
}
