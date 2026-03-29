import { getSupportedPlannerPipelineIds } from "@/services/ai/planner/functionCatalog";
import type { PlannerExplanationEntry, UnsupportedReasonCode } from "@/shared/types";
import {
  type LavaModelPayload,
  type LavaModelSupportedPayload,
  type LavaModelUnsupportedPayload,
  isRecord,
} from "@/services/ai/providers/lavaModelPayload";

const SUPPORTED_IDS = new Set(getSupportedPlannerPipelineIds());

function parseExplanationEntries(value: unknown): PlannerExplanationEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: PlannerExplanationEntry[] = [];
  value.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const kind = entry.kind;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const detail = typeof entry.detail === "string" ? entry.detail.trim() : "";
    const sourceFunctionId = typeof entry.sourceFunctionId === "string" ? entry.sourceFunctionId.trim() : "";
    if (!id || !title || !detail || !sourceFunctionId) {
      return;
    }
    const k =
      kind === "pipeline-choice" ||
      kind === "step-added" ||
      kind === "step-skipped" ||
      kind === "parameter-assumption" ||
      kind === "fallback"
        ? kind
        : null;
    if (!k) {
      return;
    }
    const relatedStepId =
      typeof entry.relatedStepId === "string" && entry.relatedStepId.trim() ? entry.relatedStepId.trim() : undefined;
    out.push({
      id,
      kind: k,
      title,
      detail,
      sourceFunctionId: sourceFunctionId as PlannerExplanationEntry["sourceFunctionId"],
      ...(relatedStepId ? { relatedStepId } : {}),
    });
  });
  return out.length ? out : undefined;
}

const KNOWN_UNSUPPORTED_CODES = new Set<string>([
  "outside-supported-universe",
  "missing-required-matrix-context",
  "supported-pipelines-unavailable",
  "invalid-provider-output-shape",
  "planner-policy-violation",
  "provider-not-configured",
  "provider-request-failed",
]);

function parseSupported(value: Record<string, unknown>): LavaModelSupportedPayload | null {
  const chosen = value.chosenPipelineId;
  if (chosen !== "count-matrix-analysis-v1" && chosen !== "bulk-rna-matrix-downstream-v1") {
    return null;
  }
  if (!SUPPORTED_IDS.has(chosen)) {
    return null;
  }
  const selectedModifications =
    value.selectedModifications && isRecord(value.selectedModifications)
      ? (value.selectedModifications as Record<string, string>)
      : undefined;
  const skippedStepIds = Array.isArray(value.skippedStepIds)
    ? value.skippedStepIds.filter((item): item is string => typeof item === "string")
    : undefined;

  return {
    kind: "supported",
    chosenPipelineId: chosen,
    selectedModifications,
    skippedStepIds,
    skipDifferentialDueToInvalidGrouping: typeof value.skipDifferentialDueToInvalidGrouping === "boolean"
      ? value.skipDifferentialDueToInvalidGrouping
      : undefined,
    preferTmmLikeNormalization:
      typeof value.preferTmmLikeNormalization === "boolean" ? value.preferTmmLikeNormalization : undefined,
    explanations: parseExplanationEntries(value.explanations),
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((w): w is string => typeof w === "string") : undefined,
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.filter((a): a is string => typeof a === "string") : undefined,
  };
}

function parseUnsupported(value: Record<string, unknown>): LavaModelUnsupportedPayload | null {
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!summary || !reason) {
    return null;
  }
  let code = typeof value.unsupportedReasonCode === "string" ? value.unsupportedReasonCode.trim() : "";
  if (!KNOWN_UNSUPPORTED_CODES.has(code)) {
    code = "outside-supported-universe";
  }
  const closest = value.closestSupportedPipelineId;
  const closestSupportedPipelineId =
    closest === null
      ? null
      : closest === "count-matrix-analysis-v1" || closest === "bulk-rna-matrix-downstream-v1"
        ? closest
        : null;

  return {
    kind: "unsupported",
    unsupportedReasonCode: code as UnsupportedReasonCode,
    summary,
    reason,
    closestSupportedPipelineId,
    explanations: parseExplanationEntries(value.explanations),
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((w): w is string => typeof w === "string") : undefined,
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.filter((a): a is string => typeof a === "string") : undefined,
  };
}

/**
 * Parses and minimally validates model JSON. Returns null when the shape is unusable.
 */
export function parseLavaModelPayload(value: unknown): LavaModelPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.kind;
  if (kind === "supported") {
    return parseSupported(value);
  }
  if (kind === "unsupported") {
    return parseUnsupported(value);
  }
  return null;
}

