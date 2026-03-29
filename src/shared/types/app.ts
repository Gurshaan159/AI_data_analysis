import type { AppPage } from "@/app/routes";
import type { AIRecommendationResult, AIRecommendationStatus, PlannerApprovalContext } from "@/shared/types/ai";
import type { PipelineDefinition, PipelineId } from "@/shared/types/pipeline";
import type { RunPreview, RunProgressState, SelectedFile } from "@/shared/types/run";
import type { ApprovedWorkflow, NormalizedWorkflow, WorkflowApproval } from "@/shared/types/workflow";
import type { ValidationResult } from "@/shared/types/validation";

export type AppMode = "established" | "ai-assisted" | null;

export interface AppState {
  currentPage: AppPage;
  selectedMode: AppMode;
  selectedPipelineId: PipelineId | null;
  selectedPipeline: PipelineDefinition | null;
  selectedFiles: SelectedFile[];
  outputFolder: string | null;
  selectedModifications: Record<string, string>;
  workflow: NormalizedWorkflow | null;
  workflowApproval: WorkflowApproval;
  aiPrompt: string;
  aiRecommendationStatus: AIRecommendationStatus;
  aiRecommendation: AIRecommendationResult | null;
  aiRecommendationApproved: boolean;
  aiPlannerApprovalContext: PlannerApprovalContext | null;
  approvedWorkflow: ApprovedWorkflow | null;
  validation: ValidationResult | null;
  runPreview: RunPreview | null;
  backendError: string | null;
  isBackendBusy: boolean;
  runProgress: RunProgressState;
}
