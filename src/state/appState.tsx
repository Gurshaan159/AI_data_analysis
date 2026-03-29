import { useMemo, useReducer, type PropsWithChildren } from "react";

import { APP_PAGES } from "@/app/routes";
import { inferFileKindFromPath } from "@/domain/files/fileKinds";
import { buildRunPreview } from "@/domain/run/runRequestBuilder";
import { applyWorkflowModificationSelections, buildWorkflowFromPipeline } from "@/domain/workflow/workflowFactory";
import { getPipelineById } from "@/registry/pipelineRegistry";
import type { AppState } from "@/shared/types";
import { AppStateContext, type AppAction, type AppStateContextValue } from "@/state/appStateContext";

const initialState: AppState = {
  currentPage: APP_PAGES.WELCOME,
  selectedMode: null,
  selectedPipelineId: null,
  selectedPipeline: null,
  selectedFiles: [],
  outputFolder: null,
  selectedModifications: {},
  workflow: null,
  workflowApproval: {
    approved: false,
    approvedAtIso: null,
  },
  aiPrompt: "",
  aiRecommendationStatus: "idle",
  aiRecommendation: null,
  aiRecommendationApproved: false,
  aiPlannerApprovalContext: null,
  approvedWorkflow: null,
  validation: null,
  runPreview: null,
  backendError: null,
  isBackendBusy: false,
  runProgress: {
    runId: null,
    finalStatus: "idle",
    progressEvents: [
      { id: "queued", label: "Queued", phase: "queued", message: "Waiting to begin." },
    ],
  },
};

function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set-page":
      return { ...state, currentPage: action.page };
    case "set-mode":
      return { ...state, selectedMode: action.mode };
    case "select-pipeline": {
      const selected = action.pipelineId ? getPipelineById(action.pipelineId) ?? null : null;
      const workflow = action.pipelineId ? buildWorkflowFromPipeline(action.pipelineId) : null;
      const selectedModifications = workflow?.selectedModifications ?? {};
      return {
        ...state,
        selectedPipelineId: action.pipelineId,
        selectedPipeline: selected,
        selectedModifications,
        workflow,
        workflowApproval: { approved: false, approvedAtIso: null },
        aiRecommendationApproved: false,
        aiPlannerApprovalContext: null,
        approvedWorkflow: null,
        validation: null,
        runPreview: buildRunPreview(action.pipelineId, state.selectedFiles.length, state.outputFolder),
      };
    }
    case "set-uploaded-files": {
      const selectedFiles = action.files.map((path) => ({ path, kind: inferFileKindFromPath(path) }));
      return {
        ...state,
        selectedFiles,
        runPreview: buildRunPreview(state.selectedPipelineId, selectedFiles.length, state.outputFolder),
      };
    }
    case "set-output-folder":
      return {
        ...state,
        outputFolder: action.folder,
        runPreview: buildRunPreview(state.selectedPipelineId, state.selectedFiles.length, action.folder),
      };
    case "set-modification-option": {
      if (!state.selectedPipeline || !state.workflow) {
        return state;
      }
      const selectedModifications = {
        ...state.selectedModifications,
        [action.slotId]: action.optionId,
      };
      const workflow = applyWorkflowModificationSelections(state.workflow, state.selectedPipeline, selectedModifications);
      return { ...state, selectedModifications, workflow, workflowApproval: { approved: false, approvedAtIso: null } };
    }
    case "set-workflow":
      return {
        ...state,
        workflow: action.workflow,
      };
    case "apply-ai-workflow-handoff": {
      const selectedPipeline = getPipelineById(action.handoff.selectedPipelineId);
      if (!selectedPipeline) {
        return {
          ...state,
          backendError: `Planner handoff failed: pipeline '${action.handoff.selectedPipelineId}' is not registered.`,
        };
      }
      return {
        ...state,
        selectedPipelineId: action.handoff.selectedPipelineId,
        selectedPipeline,
        selectedModifications: action.handoff.selectedModifications,
        workflow: action.handoff.workflow,
        workflowApproval: { approved: false, approvedAtIso: null },
        aiRecommendationApproved: true,
        aiPlannerApprovalContext: action.handoff.plannerContext,
        approvedWorkflow: null,
        validation: null,
        runPreview: buildRunPreview(action.handoff.selectedPipelineId, state.selectedFiles.length, state.outputFolder),
      };
    }
    case "set-workflow-approved": {
      const approvedAtIso = action.approved ? new Date().toISOString() : null;
      return {
        ...state,
        workflowApproval: { approved: action.approved, approvedAtIso },
        approvedWorkflow:
          action.approved && state.workflow && state.selectedPipelineId && approvedAtIso
            ? {
                pipelineId: state.selectedPipelineId,
                approvedAtIso,
                workflow: state.workflow,
              }
            : null,
      };
    }
    case "set-ai-prompt":
      return { ...state, aiPrompt: action.prompt };
    case "set-ai-recommendation-status":
      return { ...state, aiRecommendationStatus: action.status };
    case "set-ai-recommendation":
      return {
        ...state,
        aiRecommendation: action.recommendation,
        aiPlannerApprovalContext: null,
      };
    case "set-ai-recommendation-approved":
      return { ...state, aiRecommendationApproved: action.approved };
    case "set-validation":
      return { ...state, validation: action.validation };
    case "set-run-stage":
      return { ...state, runProgress: { ...state.runProgress, finalStatus: action.stage } };
    case "set-run-id":
      return { ...state, runProgress: { ...state.runProgress, runId: action.runId } };
    case "set-run-events":
      return { ...state, runProgress: { ...state.runProgress, progressEvents: action.events } };
    case "append-run-event":
      return {
        ...state,
        runProgress: {
          ...state.runProgress,
          progressEvents: [...state.runProgress.progressEvents, action.event],
        },
      };
    case "set-backend-error":
      return { ...state, backendError: action.error };
    case "set-backend-busy":
      return { ...state, isBackendBusy: action.busy };
    default:
      return state;
  }
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appStateReducer, initialState);

  const value = useMemo<AppStateContextValue>(() => ({ state, dispatch }), [state]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
