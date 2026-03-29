import type { AppState } from "@/shared/types";
import { buildRunRequestIfValid, validateRunRequest } from "@/domain/validation/validationService";

export function getRequiredInputFileCount(state: AppState): number {
  if (!state.selectedPipeline) {
    return 0;
  }
  return state.selectedPipeline.supportedInputKinds.reduce((total, input) => total + input.minFiles, 0);
}

export function getCurrentValidation(state: AppState) {
  return validateRunRequest({
    selectedMode: state.selectedMode,
    selectedPipelineId: state.selectedPipelineId,
    selectedPipeline: state.selectedPipeline,
    selectedFiles: state.selectedFiles,
    outputFolder: state.outputFolder,
    selectedModifications: state.selectedModifications,
    approvedWorkflow: state.approvedWorkflow,
    aiRecommendation: state.aiRecommendation,
    aiRecommendationApproved: state.aiRecommendationApproved,
  });
}

export function canContinueToReview(state: AppState): boolean {
  const validation = getCurrentValidation(state);
  return !validation.errors.some((error) => error.field === "pipeline" || error.field === "files" || error.field === "outputFolder");
}

export function getRunRequestBuild(state: AppState) {
  return buildRunRequestIfValid({
    selectedMode: state.selectedMode,
    selectedPipelineId: state.selectedPipelineId,
    selectedPipeline: state.selectedPipeline,
    selectedFiles: state.selectedFiles,
    outputFolder: state.outputFolder,
    selectedModifications: state.selectedModifications,
    approvedWorkflow: state.approvedWorkflow,
    aiRecommendation: state.aiRecommendation,
    aiRecommendationApproved: state.aiRecommendationApproved,
    executionMode: "mock-local",
  });
}
