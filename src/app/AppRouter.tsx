import { APP_PAGES } from "@/app/routes";
import { AssistedAnalysisPage } from "@/features/ai-assisted/AssistedAnalysisPage";
import { EstablishedAnalysisPage } from "@/features/established-analysis/EstablishedAnalysisPage";
import { ReviewWorkflowPage } from "@/features/review-workflow/ReviewWorkflowPage";
import { RunAnalysisPage } from "@/features/run-analysis/RunAnalysisPage";
import { WelcomePage } from "@/features/welcome/WelcomePage";
import { useAppState } from "@/state/useAppState";

export function AppRouter() {
  const { state } = useAppState();

  switch (state.currentPage) {
    case APP_PAGES.ESTABLISHED_ANALYSIS:
      return <EstablishedAnalysisPage />;
    case APP_PAGES.AI_ASSISTED_ANALYSIS:
      return <AssistedAnalysisPage />;
    case APP_PAGES.REVIEW_WORKFLOW:
      return <ReviewWorkflowPage />;
    case APP_PAGES.RUN_ANALYSIS:
      return <RunAnalysisPage />;
    case APP_PAGES.WELCOME:
    default:
      return <WelcomePage />;
  }
}
