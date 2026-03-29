import { useEffect, useRef, useState } from "react";

import { APP_PAGES } from "@/app/routes";
import { RunProgressPanel } from "@/components/run/RunProgressPanel";
import { PageShell } from "@/components/ui/PageShell";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { toBackendErrorMessage } from "@/services/backend/backendError";
import { submitWorkflowExecution, subscribeRunProgress, requestRunCancellation } from "@/services/execution/executionService";
import { validateOutputPath } from "@/services/backend/pathService";
import { pickInputFiles, pickOutputFolder } from "@/services/files/filePickerService";
import { getRunRequestBuild } from "@/state/selectors";
import { useAppState } from "@/state/useAppState";

export function RunAnalysisPage() {
  const { state, dispatch } = useAppState();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const runRequestBuild = getRunRequestBuild(state);
  const isSubmitting =
    state.runProgress.finalStatus === "queued" ||
    state.runProgress.finalStatus === "validating" ||
    state.runProgress.finalStatus === "preparing" ||
    state.runProgress.finalStatus === "running-step" ||
    state.runProgress.finalStatus === "finalizing";

  useEffect(() => {
    let active = true;
    void subscribeRunProgress((event) => {
      if (!active) {
        return;
      }
      if (state.runProgress.runId && event.runId !== state.runProgress.runId) {
        return;
      }

      dispatch({ type: "set-run-stage", stage: event.phase });
      dispatch({
        type: "append-run-event",
        event: {
          id: `${event.runId}-${event.progressIndex}`,
          label: event.stepLabel ?? event.phase,
          phase: event.phase,
          message: event.message,
        },
      });
    })
      .then((unlisten) => {
        unsubscribeRef.current = unlisten;
      })
      .catch((error) => {
        dispatch({
          type: "set-backend-error",
          error: toBackendErrorMessage(error, "Unable to subscribe to backend progress updates."),
        });
      });

    return () => {
      active = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [dispatch, state.runProgress.runId]);

  async function handlePickInputs() {
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
        error: toBackendErrorMessage(error, "Unable to update selected input files."),
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
        dispatch({ type: "set-backend-error", error: validation.reason ?? "Output path is invalid." });
      }
    } catch (error) {
      dispatch({
        type: "set-backend-error",
        error: toBackendErrorMessage(error, "Unable to select or validate output folder."),
      });
    } finally {
      setIsPickingFolder(false);
    }
  }

  async function runWorkflow() {
    if (!runRequestBuild.runRequest) {
      return;
    }
    dispatch({ type: "set-backend-error", error: null });
    dispatch({ type: "set-backend-busy", busy: true });
    dispatch({ type: "set-run-events", events: [] });
    try {
      const start = await submitWorkflowExecution(runRequestBuild.runRequest);
      dispatch({ type: "set-run-id", runId: start.runId });
      dispatch({ type: "set-run-stage", stage: start.initialPhase });
    } catch (error) {
      dispatch({
        type: "set-backend-error",
        error: `Failed to start run: ${toBackendErrorMessage(error, "Backend command rejected the request.")}`,
      });
      dispatch({ type: "set-run-stage", stage: "failed" });
    } finally {
      dispatch({ type: "set-backend-busy", busy: false });
    }
  }

  async function cancelRun() {
    if (!state.runProgress.runId) {
      return;
    }
    try {
      dispatch({ type: "set-backend-busy", busy: true });
      const cancelled = await requestRunCancellation(state.runProgress.runId);
      if (!cancelled) {
        dispatch({ type: "set-backend-error", error: "Run cancellation was not accepted by backend." });
      }
    } catch (error) {
      dispatch({
        type: "set-backend-error",
        error: `Failed to cancel run: ${toBackendErrorMessage(error, "Unable to cancel run.")}`,
      });
    } finally {
      dispatch({ type: "set-backend-busy", busy: false });
    }
  }

  return (
    <PageShell
      title="Run Analysis"
      description="Run summary and placeholder execution status. Real orchestration plugs in later."
    >
      <div className="stack">
        <StatusPanel title="Run Summary" tone="neutral">
          <p>
            <strong>Pipeline:</strong> {state.selectedPipeline?.displayName ?? "None selected"}
          </p>
          <p>
            <strong>Input files:</strong> {state.selectedFiles.length}
          </p>
          <p>
            <strong>Output folder:</strong> {state.outputFolder ?? "Not selected"}
          </p>
          {state.runPreview ? (
            <p>
              <strong>Expected outputs:</strong> {state.runPreview.expectedOutputs.join(", ")}
            </p>
          ) : null}
          <div className="button-row">
            <button
              type="button"
              onClick={() => {
                void handlePickInputs();
              }}
              disabled={isPickingFiles || state.isBackendBusy || isSubmitting}
            >
              {isPickingFiles ? "Selecting Input Files..." : "Update Input Files"}
            </button>
            <p className="file-picker-hint">
              You can select multiple input files at once (e.g. matrix and metadata). Use Ctrl/Cmd+click in the file list if
              needed.
            </p>
            <button
              type="button"
              onClick={() => {
                void handlePickOutputFolder();
              }}
              disabled={isPickingFolder || state.isBackendBusy || isSubmitting}
            >
              {isPickingFolder ? "Selecting Output Folder..." : "Select Output Folder"}
            </button>
          </div>
        </StatusPanel>

        <StatusPanel
          title="Execution Status (Backend Placeholder)"
          tone={state.runProgress.finalStatus === "completed" ? "success" : "neutral"}
        >
          <RunProgressPanel runProgress={state.runProgress} />
          <button
            type="button"
            onClick={() => {
              void runWorkflow();
            }}
            disabled={!runRequestBuild.runRequest || isSubmitting || state.isBackendBusy}
          >
            {isSubmitting ? "Running..." : "Run Approved Workflow"}
          </button>
          <button
            type="button"
            disabled={!state.runProgress.runId || !isSubmitting || state.isBackendBusy}
            onClick={() => {
              void cancelRun();
            }}
          >
            Cancel Run
          </button>
          {!runRequestBuild.validation.isValid ? (
            <ul>
              {runRequestBuild.validation.errors.map((issue) => (
                <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {state.backendError ? <p>{state.backendError}</p> : null}
          {state.runProgress.finalStatus === "completed" ? (
            <p>Run completed (placeholder). Result packaging and artifact links will be added later.</p>
          ) : null}
          {state.runProgress.finalStatus === "cancelled" ? (
            <p>Run cancelled. You can adjust inputs and start again.</p>
          ) : null}
          {state.runProgress.finalStatus === "failed" ? (
            <p>Run failed. Review the backend error and retry when ready.</p>
          ) : null}
        </StatusPanel>
      </div>

      <div className="button-row">
        <button type="button" onClick={() => dispatch({ type: "set-page", page: APP_PAGES.REVIEW_WORKFLOW })}>
          Back to Review
        </button>
      </div>
    </PageShell>
  );
}
