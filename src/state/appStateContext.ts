import { createContext, type Dispatch } from "react";

import type { AppPage } from "@/app/routes";
import type {
  AIRecommendationResult,
  AppMode,
  AppState,
  NormalizedWorkflow,
  PipelineId,
  ValidationResult,
} from "@/shared/types";

export type AppAction =
  | { type: "set-page"; page: AppPage }
  | { type: "set-mode"; mode: AppMode }
  | { type: "select-pipeline"; pipelineId: PipelineId | null }
  | { type: "set-uploaded-files"; files: string[] }
  | { type: "set-output-folder"; folder: string | null }
  | { type: "set-modification-option"; slotId: string; optionId: string }
  | { type: "set-workflow"; workflow: NormalizedWorkflow | null }
  | { type: "set-workflow-approved"; approved: boolean }
  | { type: "set-ai-prompt"; prompt: string }
  | { type: "set-ai-recommendation-status"; status: AppState["aiRecommendationStatus"] }
  | { type: "set-ai-recommendation"; recommendation: AIRecommendationResult | null }
  | { type: "set-ai-recommendation-approved"; approved: boolean }
  | { type: "set-validation"; validation: ValidationResult | null }
  | { type: "set-run-stage"; stage: AppState["runProgress"]["finalStatus"] }
  | { type: "set-run-id"; runId: string | null }
  | { type: "set-run-events"; events: AppState["runProgress"]["progressEvents"] }
  | { type: "append-run-event"; event: AppState["runProgress"]["progressEvents"][number] }
  | { type: "set-backend-error"; error: string | null }
  | { type: "set-backend-busy"; busy: boolean };

export interface AppStateContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

export const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);
