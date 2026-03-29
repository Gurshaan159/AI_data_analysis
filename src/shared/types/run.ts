import type { OutputKind, PipelineId, FileKind } from "@/shared/types/pipeline";
import type { ApprovedWorkflow } from "@/shared/types/workflow";

export type ExecutionMode = "mock-local";
export type BackendRunPhase =
  | "queued"
  | "validating"
  | "preparing"
  | "running-step"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface SelectedFile {
  path: string;
  kind: FileKind;
}

export interface NormalizedRunRequest {
  selectedPipelineId: PipelineId;
  selectedFiles: SelectedFile[];
  outputFolder: string;
  approvedWorkflow: ApprovedWorkflow;
  selectedModifications: Record<string, string>;
  executionMode: ExecutionMode;
}

export interface BackendRunStartResponse {
  runId: string;
  initialPhase: BackendRunPhase;
}

export interface BackendRunProgressEvent {
  runId: string;
  phase: BackendRunPhase;
  message: string;
  stepId: string | null;
  stepLabel: string | null;
  progressIndex: number;
  totalProgress: number;
}

export interface RunPreview {
  selectedPipelineId: PipelineId;
  selectedFileCount: number;
  outputFolder: string | null;
  expectedOutputs: OutputKind[];
}

export interface ProgressEventEntry {
  id: string;
  label: string;
  phase: BackendRunPhase;
  message: string;
}

export interface RunProgressState {
  runId: string | null;
  finalStatus: "idle" | BackendRunPhase;
  progressEvents: ProgressEventEntry[];
}
