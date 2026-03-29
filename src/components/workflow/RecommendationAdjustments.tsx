import type { SupportedRecommendationResult } from "@/shared/types";

interface RecommendationAdjustmentsProps {
  recommendation: SupportedRecommendationResult;
}

export function RecommendationAdjustments({ recommendation }: RecommendationAdjustmentsProps) {
  if (
    !recommendation.addedSteps.length &&
    !recommendation.modifiedSteps.length &&
    !recommendation.skippedSteps.length &&
    !recommendation.changedParameters.length
  ) {
    return <p>No step or parameter adjustments suggested.</p>;
  }

  return (
    <section className="stack">
      <div className="change-count-row">
        {!!recommendation.addedSteps.length && (
          <span className="status-pill change-added">{recommendation.addedSteps.length} added</span>
        )}
        {!!recommendation.modifiedSteps.length && (
          <span className="status-pill change-modified">{recommendation.modifiedSteps.length} modified</span>
        )}
        {!!recommendation.skippedSteps.length && (
          <span className="status-pill change-skipped">{recommendation.skippedSteps.length} skipped</span>
        )}
      </div>

      {recommendation.addedSteps.map((step) => (
        <article key={step.stepId} className="adjustment-card">
          <h4>
            <span className="status-pill change-added">added</span> {step.displayLabel}
          </h4>
          <p>{step.explanation}</p>
        </article>
      ))}
      {recommendation.modifiedSteps.map((step) => (
        <article key={step.stepId} className="adjustment-card">
          <h4>
            <span className="status-pill change-modified">modified</span> {step.displayLabel}
          </h4>
          <p>{step.explanation}</p>
        </article>
      ))}
      {recommendation.skippedSteps.map((step) => (
        <article key={step.stepId} className="adjustment-card">
          <h4>
            <span className="status-pill change-skipped">skipped</span> {step.displayLabel}
          </h4>
          <p>{step.explanation}</p>
        </article>
      ))}
      {!!recommendation.changedParameters.length && (
        <article className="adjustment-card">
          <h4>Changed Parameters</h4>
          <ul>
            {recommendation.changedParameters.map((change) => (
              <li key={change.parameterKey}>
                <strong>{change.parameterKey}</strong>: {change.previousValue} {"->"} {change.nextValue}
                <p>{change.summary}</p>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
