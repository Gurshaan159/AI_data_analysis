import type { WorkflowDiagramModel, WorkflowStep } from "@/shared/types";

export function buildWorkflowDiagram(
  steps: WorkflowStep[],
  isApproved: boolean,
): WorkflowDiagramModel {
  return {
    nodes: steps.map((step) => ({
      id: step.stepId,
      label: step.displayLabel,
      status: step.modifiedByAi ? "modified" : isApproved ? "approved" : "ready",
    })),
    edges: steps.slice(1).map((step, index) => ({
      from: steps[index].stepId,
      to: step.stepId,
    })),
  };
}
