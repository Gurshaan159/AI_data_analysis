import { useState } from "react";

import { APP_PAGES } from "@/app/routes";
import { RecommendationAdjustments } from "@/components/workflow/RecommendationAdjustments";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import { PageShell } from "@/components/ui/PageShell";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { getPipelineRegistry } from "@/registry/pipelineRegistry";
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
    dispatch({ type: "set-ai-recommendation-status", status: "loading" });
    const recommendation = await recommendWorkflow({
      availablePipelines: getPipelineRegistry(),
      userPrompt: state.aiPrompt,
    });
    dispatch({ type: "set-ai-recommendation", recommendation });

    if (recommendation?.kind === "supported") {
      dispatch({ type: "set-ai-recommendation-status", status: "supported" });
      dispatch({
        type: "select-pipeline",
        pipelineId: recommendation.chosenPipelineId,
      });
      dispatch({ type: "set-workflow", workflow: recommendation.suggestedWorkflow });
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
  }

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

      {state.aiRecommendation?.kind === "supported" && state.selectedPipeline ? (
        <StatusPanel title="Recommended Supported Workflow" tone="success">
          <div className="stack">
            <p>
              <strong>Pipeline:</strong> {state.selectedPipeline.displayName}
            </p>
            <ul>
              {state.aiRecommendation.explanations.map((explanation) => (
                <li key={explanation}>{explanation}</li>
              ))}
            </ul>
            <WorkflowDiagram steps={state.aiRecommendation.suggestedWorkflow.steps} isApproved={false} />
            <RecommendationAdjustments recommendation={state.aiRecommendation} />
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
          <ul>
            {state.aiRecommendation.suggestedResources.map((suggestion) => (
              <li key={suggestion.id}>
                <a href={suggestion.url} target="_blank" rel="noreferrer">
                  {suggestion.title}
                </a>{" "}
                - {suggestion.citation}
              </li>
            ))}
          </ul>
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
          disabled={state.aiRecommendation?.kind !== "supported" || !state.selectedPipeline || !state.aiRecommendationApproved}
          onClick={() => {
            dispatch({ type: "set-page", page: APP_PAGES.REVIEW_WORKFLOW });
          }}
        >
          Approve Recommendation and Continue
        </button>
      </div>
    </PageShell>
  );
}
