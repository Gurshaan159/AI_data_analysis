import { useRef, useState } from "react";

import { APP_PAGES } from "@/app/routes";
import { AiProviderAttribution } from "@/components/workflow/AiProviderAttribution";
import {
  SupportedDecisionPresentation,
  UnsupportedDecisionPresentation,
} from "@/components/workflow/AssistedDecisionPresentation";
import { PageShell } from "@/components/ui/PageShell";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { buildApprovedAiWorkflowHandoff } from "@/domain/ai/approvalHandoff";
import { isPlannerGuardrailUnsupported, isProviderFailureUnsupported } from "@/features/ai-assisted/aiUiHelpers";
import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { recommendWorkflow } from "@/services/ai/recommendationService";
import { buildAiDecisionSummary } from "@/services/ai/summary/decisionSummaryBuilder";
import { useAppState } from "@/state/useAppState";

const EXAMPLE_PROMPTS = [
  "I have paired-end bulk RNA-seq files for treatment vs control differential expression.",
  "I am analyzing single-cell libraries and need clustering plus marker genes.",
  "I have a count matrix and metadata and need statistical contrasts.",
];

const BOUNDED_UNSUPPORTED_LEAD =
  "Your request is not currently supported by available workflows.";

const PLANNER_GUARDRAIL_LEAD =
  "The AI service returned a response that could not be applied safely within v1 planner guardrails.";

export function AssistedAnalysisPage() {
  const { state, dispatch } = useAppState();
  const [isLoading, setIsLoading] = useState(false);
  const requestInFlightRef = useRef(false);

  async function getRecommendation() {
    if (!state.aiPrompt.trim()) {
      return;
    }
    if (requestInFlightRef.current) {
      return;
    }
    requestInFlightRef.current = true;
    setIsLoading(true);
    dispatch({ type: "set-backend-error", error: null });
    dispatch({ type: "set-ai-recommendation", recommendation: null });
    dispatch({ type: "set-ai-recommendation-approved", approved: false });
    dispatch({ type: "set-ai-recommendation-status", status: "loading" });

    try {
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
        if (isProviderFailureUnsupported(recommendation)) {
          dispatch({ type: "set-ai-recommendation-status", status: "provider_error" });
        } else if (isPlannerGuardrailUnsupported(recommendation)) {
          dispatch({ type: "set-ai-recommendation-status", status: "planner_guardrail" });
        } else {
          dispatch({ type: "set-ai-recommendation-status", status: "unsupported" });
        }
        dispatch({ type: "select-pipeline", pipelineId: null });
        dispatch({ type: "set-ai-recommendation-approved", approved: false });
      } else {
        dispatch({ type: "set-ai-recommendation-status", status: "error" });
      }
    } catch {
      dispatch({ type: "set-ai-recommendation", recommendation: null });
      dispatch({ type: "set-ai-recommendation-status", status: "error" });
    } finally {
      requestInFlightRef.current = false;
      setIsLoading(false);
    }
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
  const supportedRecommendation =
    state.aiRecommendationStatus === "supported" && state.aiRecommendation?.kind === "supported"
      ? state.aiRecommendation
      : null;
  const decisionSummary = state.aiRecommendation ? buildAiDecisionSummary(state.aiRecommendation, availablePipelines) : null;
  const supportedSummary = decisionSummary?.kind === "supported" ? decisionSummary : null;
  const unsupportedSummary = decisionSummary?.kind === "unsupported" ? decisionSummary : null;

  const showBoundedUnsupported =
    state.aiRecommendationStatus === "unsupported" && state.aiRecommendation?.kind === "unsupported" && unsupportedSummary;

  const showPlannerGuardrail =
    state.aiRecommendationStatus === "planner_guardrail" && state.aiRecommendation?.kind === "unsupported" && unsupportedSummary;

  const inputDisabled = isLoading;

  return (
    <PageShell
      title="AI-Assisted Analysis"
      description="Describe your data and goals. AI can propose a supported workflow for your approval."
    >
      <div className="stack" aria-busy={isLoading}>
        <label htmlFor="ai-prompt">Describe your dataset and question</label>
        <textarea
          id="ai-prompt"
          className="prompt-box"
          value={state.aiPrompt}
          onChange={(event) => dispatch({ type: "set-ai-prompt", prompt: event.currentTarget.value })}
          placeholder="Example: paired-end bulk RNA-seq with treatment/control groups..."
          rows={6}
          disabled={inputDisabled}
        />
        <div>
          <strong>Example prompts</strong>
          <ul>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  className="linkish-button"
                  disabled={inputDisabled}
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
          {isLoading ? "Generating recommendation…" : "Generate Recommendation"}
        </button>
      </div>

      {state.aiRecommendationStatus === "loading" ? (
        <StatusPanel title="AI is working" tone="neutral">
          <p className="ai-loading-hint">Analyzing your prompt and mapping it to supported workflows.</p>
          <p className="ai-loading-subtle">This may take a few seconds.</p>
        </StatusPanel>
      ) : null}

      {supportedRecommendation && supportedSummary ? (
        <StatusPanel title="Recommendation ready" tone="success">
          <SupportedDecisionPresentation
            summary={supportedSummary}
            recommendation={supportedRecommendation}
            approved={state.aiRecommendationApproved}
            onApprovedChange={(approved) => dispatch({ type: "set-ai-recommendation-approved", approved })}
          />
        </StatusPanel>
      ) : null}

      {showBoundedUnsupported ? (
        <StatusPanel title="Not currently supported" tone="warning">
          <UnsupportedDecisionPresentation summary={unsupportedSummary} leadUserMessage={BOUNDED_UNSUPPORTED_LEAD} />
        </StatusPanel>
      ) : null}

      {showPlannerGuardrail ? (
        <StatusPanel title="Planner could not apply this response" tone="warning">
          <UnsupportedDecisionPresentation summary={unsupportedSummary} leadUserMessage={PLANNER_GUARDRAIL_LEAD} />
        </StatusPanel>
      ) : null}

      {state.aiRecommendationStatus === "provider_error" && state.aiRecommendation?.kind === "unsupported" ? (
        <StatusPanel title="AI service unavailable" tone="error">
          <p>AI service is not configured or temporarily unavailable.</p>
          {state.aiRecommendation.reason ? (
            <p className="ai-decision-muted" role="status">
              <strong>Detail:</strong> {state.aiRecommendation.reason}
            </p>
          ) : null}
          <p className="ai-decision-muted">
            Check that your AI settings are correct, confirm your network connection, then try again. You can also use
            Mock mode for local planning without an external service.
          </p>
          <p className="ai-decision-muted">
            <strong>What you can do:</strong> adjust configuration, retry shortly, or rephrase and submit again.
          </p>
          <AiProviderAttribution />
        </StatusPanel>
      ) : null}

      {state.aiRecommendationStatus === "error" && !state.aiRecommendation ? (
        <StatusPanel title="No recommendation received" tone="warning">
          <p>We could not produce a recommendation from this prompt. Edit your description and try again.</p>
          <AiProviderAttribution />
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
