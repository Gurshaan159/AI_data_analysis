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
      {recommendation.modifiedSteps.map((step) => (
        <article key={step.stepId} className="adjustment-card">
          <h4>{step.displayLabel} (modified)</h4>
          <p>{step.explanation}</p>
        </article>
      ))}
      {recommendation.addedSteps.map((step) => (
        <article key={step.stepId} className="adjustment-card">
          <h4>{step.displayLabel} (added)</h4>
          <p>{step.explanation}</p>
        </article>
      ))}
      {recommendation.skippedSteps.map((step) => (
        <article key={step.stepId} className="adjustment-card">
          <h4>{step.displayLabel} (skipped)</h4>
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
