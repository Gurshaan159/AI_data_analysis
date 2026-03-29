import { APP_PAGES } from "@/app/routes";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import { PageShell } from "@/components/ui/PageShell";
import { StatusPanel } from "@/components/ui/StatusPanel";
import { getRunRequestBuild } from "@/state/selectors";
import { useAppState } from "@/state/useAppState";

export function ReviewWorkflowPage() {
  const { state, dispatch } = useAppState();
  const runRequestBuild = getRunRequestBuild(state);
  const structuredWarnings = Array.from(
    new Set([...(state.workflow?.warnings ?? []), ...(state.aiPlannerApprovalContext?.warnings ?? [])]),
  );
  const structuredAssumptions = state.aiPlannerApprovalContext?.assumptions ?? [];

  function approveWorkflow() {
    if (!state.workflow || !state.selectedPipeline) {
      return;
    }
    dispatch({ type: "set-workflow-approved", approved: true });
    dispatch({ type: "set-validation", validation: runRequestBuild.validation });
    dispatch({ type: "set-page", page: APP_PAGES.RUN_ANALYSIS });
  }

  const editPage =
    state.selectedMode === "ai-assisted" ? APP_PAGES.AI_ASSISTED_ANALYSIS : APP_PAGES.ESTABLISHED_ANALYSIS;

  return (
    <PageShell
      title="Review Workflow"
      description="Verify the final workflow, selected files, and output location before running."
    >
      {state.selectedPipeline && state.workflow ? (
        <div className="stack">
          <StatusPanel title="Chosen Workflow" tone="neutral">
            <p>
              <strong>{state.selectedPipeline.displayName}</strong>
            </p>
            <WorkflowDiagram steps={state.workflow.steps} isApproved={state.workflowApproval.approved} />
          </StatusPanel>

          <StatusPanel title="Expected Outputs" tone="neutral">
            <ul>
              {state.selectedPipeline.supportedOutputKinds.map((output) => (
                <li key={output}>{output}</li>
              ))}
            </ul>
          </StatusPanel>

          <StatusPanel title="Selected Inputs" tone="neutral">
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
            <p>
              <strong>Output folder:</strong> {state.outputFolder ?? "Not selected yet."}
            </p>
          </StatusPanel>

          {structuredWarnings.length || structuredAssumptions.length ? (
            <StatusPanel title="Warnings and Assumptions" tone="warning">
              <ul>
                {structuredWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
                {structuredAssumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </StatusPanel>
          ) : null}
          {!runRequestBuild.validation.isValid ? (
            <StatusPanel title="Validation Issues" tone="warning">
              <ul>
                {runRequestBuild.validation.errors.map((issue) => (
                  <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
                ))}
              </ul>
            </StatusPanel>
          ) : null}
        </div>
      ) : (
        <p>No pipeline selected.</p>
      )}

      <div className="button-row">
        <button type="button" onClick={() => dispatch({ type: "set-page", page: editPage })}>
          Back to Edit
        </button>
        <button type="button" disabled={!state.selectedPipeline || !state.workflow} onClick={approveWorkflow}>
          Approve Workflow
        </button>
      </div>
    </PageShell>
  );
}
