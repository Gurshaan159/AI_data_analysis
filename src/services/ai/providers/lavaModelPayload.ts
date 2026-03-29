import type {
  PlannerExplanationEntry,
  SupportedPlannerPipelineId,
  UnsupportedReasonCode,
} from "@/shared/types";

/**
 * Narrow JSON contract returned by the Lava chat model (after extraction).
 * The app materializes full AIRecommendationResult from this + registry-backed workflows.
 */
export interface LavaModelSupportedPayload {
  kind: "supported";
  chosenPipelineId: SupportedPlannerPipelineId;
  /** Optional; merged with pipeline defaults. Keys must match modification slot ids. */
  selectedModifications?: Record<string, string>;
  /** Step ids to mark skipped (must exist on the chosen pipeline). */
  skippedStepIds?: string[];
  /** When true, skips the differential-expression step (matrix-model / bulk-matrix-model). */
  skipDifferentialDueToInvalidGrouping?: boolean;
  /** When true with bulk downstream pipeline, selects tmm-like normalization when applicable. */
  preferTmmLikeNormalization?: boolean;
  explanations?: PlannerExplanationEntry[];
  warnings?: string[];
  assumptions?: string[];
}

export interface LavaModelUnsupportedPayload {
  kind: "unsupported";
  unsupportedReasonCode: UnsupportedReasonCode;
  summary: string;
  reason: string;
  closestSupportedPipelineId: SupportedPlannerPipelineId | null;
  explanations?: PlannerExplanationEntry[];
  warnings?: string[];
  assumptions?: string[];
}

export type LavaModelPayload = LavaModelSupportedPayload | LavaModelUnsupportedPayload;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
