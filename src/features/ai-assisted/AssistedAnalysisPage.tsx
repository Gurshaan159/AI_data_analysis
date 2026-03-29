import { useState } from "react";

import { APP_PAGES } from "@/app/routes";
import { RecommendationAdjustments } from "@/components/workflow/RecommendationAdjustments";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import { PageShell } from "@/components/ui/PageShell";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { buildApprovedAiWorkflowHandoff } from "@/domain/ai/approvalHandoff";
import { getPipelineById, getPipelineRegistry } from "@/registry/pipelineRegistry";
import { recommendWorkflow } from "@/services/ai/recommendationService";
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

  const supportedRecommendation = state.aiRecommendation?.kind === "supported" ? state.aiRecommendation : null;
  const recommendedPipeline = supportedRecommendation ? getPipelineById(supportedRecommendation.chosenPipelineId) : null;

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

      {supportedRecommendation && recommendedPipeline ? (
        <StatusPanel title="Recommended Supported Workflow" tone="success">
          <div className="stack">
            <p>
              <strong>Pipeline:</strong> {recommendedPipeline.displayName}
            </p>
            <ul>
              {supportedRecommendation.explanations.map((explanation) => (
                <li key={explanation.id}>
                  <strong>{explanation.title}:</strong> {explanation.detail}
                </li>
              ))}
            </ul>
            <WorkflowDiagram steps={supportedRecommendation.workflowProposal.steps} isApproved={false} />
            <RecommendationAdjustments recommendation={supportedRecommendation} />
            <label>
              <input
                type="checkbox"
                checked={state.aiRecommendationApproved}
                onChange={(event) =>
                  dispatch({ type: "set-ai-recommendation-approved", approved: event.currentTarget.checked })
                }
              />
              I approve this AI recommendation for review.
            </label>
          </div>
        </StatusPanel>
      ) : null}

      {state.aiRecommendation?.kind === "unsupported" ? (
        <StatusPanel title="Unsupported Request" tone="warning">
          <p>{state.aiRecommendation.summary}</p>
          <p>{state.aiRecommendation.reason}</p>
          {state.aiRecommendation.closestSupportedPipelineId ? (
            <p>
              <strong>Closest supported workflow:</strong> {state.aiRecommendation.closestSupportedPipelineId}
            </p>
          ) : null}
          <ul>
            {state.aiRecommendation.suggestedResources.map((suggestion) => (
              <li key={suggestion.id}>
                <strong>{suggestion.title}</strong>: {suggestion.description}
                {suggestion.url ? (
                  <>
                    {" "}
                    <a href={suggestion.url} target="_blank" rel="noreferrer">
                      link
                    </a>
                  </>
                ) : null}
                {suggestion.citation ? ` (${suggestion.citation})` : null}
              </li>
            ))}
          </ul>
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
          disabled={!supportedRecommendation || !recommendedPipeline || !state.aiRecommendationApproved}
          onClick={approveRecommendationAndContinue}
        >
          Approve Recommendation and Continue
        </button>
      </div>
    </PageShell>
  );
}
