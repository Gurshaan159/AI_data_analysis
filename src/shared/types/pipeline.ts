export type PipelineId =
  | "bulk-rna-seq-v1"
  | "bulk-rna-matrix-downstream-v1"
  | "scrna-seq-v1"
  | "atac-seq-v1"
  | "chip-seq-v1"
  | "count-matrix-analysis-v1";

export type PipelineFamilyId = "rna-seq" | "single-cell" | "chromatin" | "matrix-analysis";

export type FileKind = "fastq" | "matrix" | "metadata" | "unknown";
export type OutputKind =
  | "qc-report"
  | "normalized-count-matrix"
  | "differential-expression-table"
  | "volcano-plot"
  | "cluster-markers"
  | "peak-set"
  | "annotated-regions"
  | "accessibility-matrix"
  | "summary-report";

export interface InputRequirement {
  kind: FileKind;
  minFiles: number;
  description: string;
}

export interface ValidationRequirement {
  id: string;
  description: string;
  requiredMetadataFields?: string[];
  approvalRequired?: boolean;
}

export type WorkflowStepCategory =
  | "preprocessing"
  | "quality-control"
  | "alignment"
  | "quantification"
  | "normalization"
  | "statistical-analysis"
  | "clustering"
  | "peak-calling"
  | "annotation"
  | "reporting"
  | "review";

export interface WorkflowStepTemplate {
  id: string;
  displayLabel: string;
  category: WorkflowStepCategory;
  required: boolean;
  explanation: string;
  expectedOutputs: OutputKind[];
}

export type ModificationSlotCategory =
  | "reference"
  | "quality-threshold"
  | "normalization"
  | "peak-calling"
  | "analysis-depth";
export type EditAvailability = "now" | "later";

export interface ModificationOption {
  id: string;
  label: string;
  effectSummary: string;
}

export interface ModificationSlot {
  id: string;
  label: string;
  description: string;
  category: ModificationSlotCategory;
  supportedOptions: ModificationOption[];
  defaultOptionId: string;
  editAvailability: EditAvailability;
  aiCanChange: boolean;
  effectSummary: string;
}

export interface PipelineDefinition {
  id: PipelineId;
  familyId: PipelineFamilyId;
  displayName: string;
  shortDescription: string;
  supportedInputKinds: InputRequirement[];
  supportedOutputKinds: OutputKind[];
  defaultWorkflowSteps: WorkflowStepTemplate[];
  modificationSlots: ModificationSlot[];
  validationRequirements: ValidationRequirement[];
  recommendedUseCases: string[];
  constraints: string[];
}
