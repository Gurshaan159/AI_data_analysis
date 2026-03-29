import type { PipelineDefinition, PipelineId } from "@/shared/types";

interface PipelineCardProps {
  pipeline: PipelineDefinition;
  isSelected: boolean;
  onSelect: (pipelineId: PipelineId) => void;
}

export function PipelineCard({ pipeline, isSelected, onSelect }: PipelineCardProps) {
  return (
    <article className={`pipeline-card ${isSelected ? "pipeline-card-selected" : ""}`}>
      <header>
        <h3>{pipeline.displayName}</h3>
        <p>{pipeline.shortDescription}</p>
      </header>
      <div className="pipeline-meta">
        <div>
          <strong>Supported Inputs</strong>
          <ul>
            {pipeline.supportedInputKinds.map((input) => (
              <li key={input.kind}>
                {input.kind} ({input.minFiles}+): {input.description}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Expected Outputs</strong>
          <ul>
            {pipeline.supportedOutputKinds.map((output) => (
              <li key={output}>{output}</li>
            ))}
          </ul>
        </div>
      </div>
      <button type="button" onClick={() => onSelect(pipeline.id)}>
        {isSelected ? "Selected" : "Choose Pipeline"}
      </button>
    </article>
  );
}
