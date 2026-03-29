import type {
  ModificationSlot,
  OutputKind,
  PipelineId,
  WorkflowStepCategory,
  WorkflowStepTemplate,
} from "@/shared/types/pipeline";

export interface WorkflowParameterChange {
  parameterKey: string;
  previousValue: string;
  nextValue: string;
  summary: string;
}

export interface WorkflowStep {
  stepId: string;
  displayLabel: string;
  category: WorkflowStepCategory;
  required: boolean;
  addedByAi: boolean;
  modifiedByAi: boolean;
  explanation: string;
  parameterChangeSummary: WorkflowParameterChange[];
  expectedOutputs: OutputKind[];
}

export interface NormalizedWorkflow {
  pipelineId: PipelineId;
  steps: WorkflowStep[];
  modificationSlots: ModificationSlot[];
  selectedModifications: Record<string, string>;
  warnings: string[];
}

export interface WorkflowApproval {
  approved: boolean;
  approvedAtIso: string | null;
}

export interface ApprovedWorkflow {
  pipelineId: PipelineId;
  approvedAtIso: string;
  workflow: NormalizedWorkflow;
}

export interface WorkflowDiagramModel {
  nodes: Array<{ id: string; label: string; status: "ready" | "approved" | "modified" }>;
  edges: Array<{ from: string; to: string }>;
}

export function createWorkflowStepFromTemplate(template: WorkflowStepTemplate): WorkflowStep {
  return {
    stepId: template.id,
    displayLabel: template.displayLabel,
    category: template.category,
    required: template.required,
    addedByAi: false,
    modifiedByAi: false,
    explanation: template.explanation,
    parameterChangeSummary: [],
    expectedOutputs: template.expectedOutputs,
  };
}
