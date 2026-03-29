import { getPipelineById } from "@/registry/pipelineRegistry";
import type { PipelineId, RunPreview } from "@/shared/types";

export function buildRunPreview(
  selectedPipelineId: PipelineId | null,
  selectedFileCount: number,
  outputFolder: string | null,
): RunPreview | null {
  if (!selectedPipelineId) {
    return null;
  }
  const pipeline = getPipelineById(selectedPipelineId);
  if (!pipeline) {
    return null;
  }
  return {
    selectedPipelineId,
    selectedFileCount,
    outputFolder,
    expectedOutputs: pipeline.supportedOutputKinds,
  };
}
