import { ApprovalChecklist } from "@/components/workflow/ApprovalChecklist";
import { RecommendationAdjustments } from "@/components/workflow/RecommendationAdjustments";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import type { SupportedDecisionSummary, SupportedRecommendationResult, UnsupportedDecisionSummary } from "@/shared/types";

interface SupportedDecisionPresentationProps {
  summary: SupportedDecisionSummary;
  recommendation: SupportedRecommendationResult;
  approved: boolean;
  onApprovedChange: (approved: boolean) => void;
}

export function SupportedDecisionPresentation({
  summary,
  recommendation,
  approved,
  onApprovedChange,
}: SupportedDecisionPresentationProps) {
  return (
    <div className="stack">
      <section className="summary-card">
        <p>
          <strong>{summary.title}:</strong> {summary.recommendationSummary}
        </p>
        <p>
          <strong>Selected pipeline:</strong> {summary.chosenPipelineLabel}
        </p>
      </section>

      <div className="approval-summary-grid">
        <section className="summary-card">
          <h4>Why this was chosen</h4>
          <ul>
            {summary.keyReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
        <section className="summary-card">
          <h4>What will happen</h4>
          <ul>
            {summary.keyPlannedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="approval-summary-grid">
        <section className="summary-card">
          <h4>Assumptions</h4>
          {summary.assumptionsToReview.length ? (
            <ul>
              {summary.assumptionsToReview.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          ) : (
            <p>No additional assumptions were introduced.</p>
          )}
        </section>
        <section className="summary-card">
          <h4>Warnings</h4>
          {summary.warningsToReview.length ? (
            <ul>
              {summary.warningsToReview.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p>No blocking warnings detected.</p>
          )}
        </section>
      </div>

      <ApprovalChecklist items={summary.approvalChecklist} />

      <section className="summary-card">
        <h4>Planner explanations</h4>
        <ul>
          {recommendation.explanations.map((explanation) => (
            <li key={explanation.id}>
              <strong>{explanation.title}:</strong> {explanation.detail}
            </li>
          ))}
        </ul>
      </section>

      <WorkflowDiagram steps={recommendation.workflowProposal.steps} isApproved={false} />
      <section className="summary-card">
        <h4>Workflow changes to review</h4>
        <p>Added, modified, and skipped steps are highlighted with tags.</p>
        <RecommendationAdjustments recommendation={recommendation} />
      </section>
      <label>
        <input type="checkbox" checked={approved} onChange={(event) => onApprovedChange(event.currentTarget.checked)} />
        I approve this AI recommendation for review.
      </label>
    </div>
  );
}

interface UnsupportedDecisionPresentationProps {
  summary: UnsupportedDecisionSummary;
}

export function UnsupportedDecisionPresentation({ summary }: UnsupportedDecisionPresentationProps) {
  return (
    <>
      <p>
        <strong>{summary.title}:</strong> {summary.unsupportedSummary}
      </p>
      <p>{summary.unsupportedReasonDetail}</p>
      {summary.closestSupportedWorkflowLabel ? (
        <p>
          <strong>Closest supported workflow:</strong> {summary.closestSupportedWorkflowLabel}
        </p>
      ) : null}
      <strong>What you can do next</strong>
      <ul>
        {summary.nextStepSuggestions.map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
      <strong>Fallback resources</strong>
      <ul>
        {summary.fallbackResources.map((suggestion) => (
          <li key={`${suggestion.title}-${suggestion.description}`}>
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
    </>
  );
}
