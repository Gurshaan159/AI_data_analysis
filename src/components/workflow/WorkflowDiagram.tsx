import { buildWorkflowDiagram } from "@/models/workflowDiagram";
import type { WorkflowStep } from "@/shared/types";

interface WorkflowDiagramProps {
  steps: WorkflowStep[];
  isApproved: boolean;
}

export function WorkflowDiagram({ steps, isApproved }: WorkflowDiagramProps) {
  const diagram = buildWorkflowDiagram(steps, isApproved);

  return (
    <section className="workflow-diagram">
      {diagram.nodes.map((node, index) => {
        const step = steps.find((item) => item.stepId === node.id);
        const nodeClassName = [
          "workflow-node",
          step?.addedByAi ? "workflow-node-added" : "",
          step?.modifiedByAi ? "workflow-node-modified" : "",
          step?.skippedByAi ? "workflow-node-skipped" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={node.id} className="workflow-node-row">
            <article className={nodeClassName}>
              <header>
                <span className="workflow-index">{index + 1}</span>
                <h4>{node.label}</h4>
              </header>
              <div className="workflow-tags">
                <span className={`status-pill status-${node.status}`}>{node.status}</span>
                {step?.addedByAi ? <span className="status-pill change-added">added</span> : null}
                {step?.modifiedByAi ? <span className="status-pill change-modified">modified</span> : null}
                {step?.skippedByAi ? <span className="status-pill change-skipped">skipped</span> : null}
              </div>
              {step ? <p>{step.explanation}</p> : null}
            </article>
            {index < diagram.nodes.length - 1 ? <div className="workflow-link" aria-hidden /> : null}
          </div>
        );
      })}
    </section>
  );
}
