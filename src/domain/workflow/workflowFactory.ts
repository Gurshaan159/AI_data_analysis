import { getPipelineById } from "@/registry/pipelineRegistry";
import type { PipelineDefinition, PipelineId } from "@/shared/types";
import { createWorkflowStepFromTemplate, type NormalizedWorkflow } from "@/shared/types";

function toDefaultModificationSelection(pipeline: PipelineDefinition): Record<string, string> {
  return Object.fromEntries(pipeline.modificationSlots.map((slot) => [slot.id, slot.defaultOptionId]));
}

export function buildWorkflowFromPipeline(
  pipelineId: PipelineId,
  selectedModifications?: Record<string, string>,
): NormalizedWorkflow | null {
  const pipeline = getPipelineById(pipelineId);
  if (!pipeline) {
    return null;
  }

  const defaults = toDefaultModificationSelection(pipeline);
  const mergedModifications = { ...defaults, ...(selectedModifications ?? {}) };

  return {
    pipelineId,
    steps: pipeline.defaultWorkflowSteps.map((step) => createWorkflowStepFromTemplate(step)),
    modificationSlots: pipeline.modificationSlots,
    selectedModifications: mergedModifications,
    warnings: [],
  };
}

export function applyWorkflowModificationSelections(
  workflow: NormalizedWorkflow,
  pipeline: PipelineDefinition,
  selectedModifications: Record<string, string>,
): NormalizedWorkflow {
  const mergedModifications = { ...workflow.selectedModifications, ...selectedModifications };
  const changedSlots = pipeline.modificationSlots.filter(
    (slot) => mergedModifications[slot.id] && mergedModifications[slot.id] !== slot.defaultOptionId,
  );

  const nextWarnings = changedSlots.map((slot) => {
    const selectedOption = slot.supportedOptions.find((option) => option.id === mergedModifications[slot.id]);
    return `${slot.label}: ${selectedOption?.effectSummary ?? slot.effectSummary}`;
  });

  return {
    ...workflow,
    selectedModifications: mergedModifications,
    warnings: nextWarnings,
  };
}
