import { APP_PAGES, type AppPage } from "@/app/routes";
import type { AppMode } from "@/shared/types";

interface FlowProgressProps {
  currentPage: AppPage;
  mode: AppMode;
}

const ORDERED_STEPS: AppPage[] = [
  APP_PAGES.WELCOME,
  APP_PAGES.ESTABLISHED_ANALYSIS,
  APP_PAGES.AI_ASSISTED_ANALYSIS,
  APP_PAGES.REVIEW_WORKFLOW,
  APP_PAGES.RUN_ANALYSIS,
];

function isStepVisible(step: AppPage, mode: AppMode): boolean {
  if (step === APP_PAGES.ESTABLISHED_ANALYSIS) {
    return mode !== "ai-assisted";
  }
  if (step === APP_PAGES.AI_ASSISTED_ANALYSIS) {
    return mode !== "established";
  }
  return true;
}

function stepLabel(step: AppPage): string {
  switch (step) {
    case APP_PAGES.WELCOME:
      return "Path";
    case APP_PAGES.ESTABLISHED_ANALYSIS:
      return "Setup";
    case APP_PAGES.AI_ASSISTED_ANALYSIS:
      return "AI Plan";
    case APP_PAGES.REVIEW_WORKFLOW:
      return "Review";
    case APP_PAGES.RUN_ANALYSIS:
      return "Run";
    default:
      return "Step";
  }
}

export function FlowProgress({ currentPage, mode }: FlowProgressProps) {
  const visibleSteps = ORDERED_STEPS.filter((step) => isStepVisible(step, mode));
  const activeIndex = Math.max(visibleSteps.indexOf(currentPage), 0);

  return (
    <nav className="flow-progress" aria-label="Workflow progress">
      {visibleSteps.map((step, index) => {
        const status = index < activeIndex ? "done" : index === activeIndex ? "active" : "upcoming";
        return (
          <div key={step} className={`flow-step flow-step-${status}`}>
            <span className="flow-step-index">{index + 1}</span>
            <span>{stepLabel(step)}</span>
          </div>
        );
      })}
    </nav>
  );
}
