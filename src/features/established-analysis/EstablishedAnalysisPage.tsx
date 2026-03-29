import { useState } from "react";

import { APP_PAGES } from "@/app/routes";
import { PageShell } from "@/components/ui/PageShell";
import { PipelineCard } from "@/components/ui/PipelineCard";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { validateOutputFolder, validatePipelineSelection, validateSelectedFilesAgainstPipeline } from "@/domain/validation/validationService";
import { toBackendErrorMessage } from "@/services/backend/backendError";
import { validateOutputPath } from "@/services/backend/pathService";
import { pickInputFiles, pickOutputFolder } from "@/services/files/filePickerService";
import { canContinueToReview, getRequiredInputFileCount } from "@/state/selectors";
import { useAppState } from "@/state/useAppState";

export function EstablishedAnalysisPage() {
  const { state, dispatch } = useAppState();
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const pipelines = getPipelineRegistry();
  const requiredFileCount = getRequiredInputFileCount(state);
  const isReady = canContinueToReview(state);
  const pipelineValidation = validatePipelineSelection(state.selectedPipeline);
  const fileValidation = validateSelectedFilesAgainstPipeline(state.selectedFiles, state.selectedPipeline);
  const outputValidation = validateOutputFolder(state.outputFolder);

  async function handlePickFiles() {
    setIsPickingFiles(true);
    dispatch({ type: "set-backend-error", error: null });
    try {
      const files = await pickInputFiles();
      if (files.length === 0) {
        return;
      }
      dispatch({ type: "set-uploaded-files", files });
    } catch (error) {
      dispatch({
        type: "set-backend-error",
        error: toBackendErrorMessage(error, "Unable to select input files."),
      });
    } finally {
      setIsPickingFiles(false);
    }
  }

  async function handlePickOutputFolder() {
    setIsPickingFolder(true);
    dispatch({ type: "set-backend-error", error: null });
    try {
      const folder = await pickOutputFolder();
      dispatch({ type: "set-output-folder", folder });
      if (!folder) {
        return;
      }
      const validation = await validateOutputPath(folder);
      if (!validation.isValid) {
        dispatch({
          type: "set-backend-error",
          error: validation.reason ?? "Selected output path is not usable.",
        });
      }
    } catch (error) {
      dispatch({
        type: "set-backend-error",
        error: toBackendErrorMessage(error, "Unable to select or validate the output folder."),
      });
    } finally {
      setIsPickingFolder(false);
    }
  }

  return (
    <PageShell
      title="Established Analysis"
      description="Select an approved pipeline, provide required files, and choose output destination."
    >
      <section className="stack">
        <h3>Available Pipelines</h3>
        <div className="pipeline-grid">
          {pipelines.map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              isSelected={state.selectedPipeline?.id === pipeline.id}
              onSelect={(pipelineId) => dispatch({ type: "select-pipeline", pipelineId })}
            />
          ))}
        </div>
      </section>

      {state.selectedPipeline ? (
        <StatusPanel title="Inputs and Destination" tone="neutral">
          <div className="stack">
            <p>
              Required files: {requiredFileCount} | Selected files: {state.selectedFiles.length}
            </p>
            <button
              type="button"
              disabled={isPickingFiles || state.isBackendBusy}
              onClick={() => {
                void handlePickFiles();
              }}
            >
              {isPickingFiles ? "Selecting..." : "Select Input Files"}
            </button>
            {state.selectedFiles.length ? (
              <ul>
                {state.selectedFiles.map((file) => (
                  <li key={file.path}>
                    {file.path} ({file.kind})
                  </li>
                ))}
              </ul>
            ) : (
              <p>No files selected yet.</p>
            )}

            <button
              type="button"
              disabled={isPickingFolder || state.isBackendBusy}
              onClick={() => {
                void handlePickOutputFolder();
              }}
            >
              {isPickingFolder ? "Selecting..." : "Select Output Folder"}
            </button>
            <p>{state.outputFolder ?? "No output folder selected."}</p>
            {state.selectedPipeline.modificationSlots.length ? (
              <div className="stack">
                <strong>Modification Slots</strong>
                {state.selectedPipeline.modificationSlots.map((slot) => (
                  <label key={slot.id}>
                    {slot.label}
                    <select
                      value={state.selectedModifications[slot.id] ?? slot.defaultOptionId}
                      disabled={slot.editAvailability === "later"}
                      onChange={(event) =>
                        dispatch({
                          type: "set-modification-option",
                          slotId: slot.id,
                          optionId: event.currentTarget.value,
                        })
                      }
                    >
                      {slot.supportedOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </StatusPanel>
      ) : null}

      <StatusPanel title="Readiness Check" tone={isReady ? "success" : "warning"}>
        {isReady ? (
          <p>All required setup fields are complete. You can continue to workflow review.</p>
        ) : (
          <div>
            <p>Select a pipeline, meet minimum file requirements, and choose an output folder to continue.</p>
            <ul>
              {[...pipelineValidation.errors, ...fileValidation.errors, ...outputValidation.errors].map((issue) => (
                <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </StatusPanel>
      {state.backendError ? (
        <StatusPanel title="Backend Error" tone="warning">
          <p>{state.backendError}</p>
        </StatusPanel>
      ) : null}

      <div className="button-row">
        <button type="button" onClick={() => dispatch({ type: "set-page", page: APP_PAGES.WELCOME })}>
          Back
        </button>
        <button
          type="button"
          disabled={!isReady}
          onClick={() => dispatch({ type: "set-page", page: APP_PAGES.REVIEW_WORKFLOW })}
        >
          Continue
        </button>
      </div>
    </PageShell>
  );
}
