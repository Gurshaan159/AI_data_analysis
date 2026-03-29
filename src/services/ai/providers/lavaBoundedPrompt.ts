import { buildPlannerFunctionCatalog, getSupportedPlannerPipelineIds } from "@/services/ai/planner/functionCatalog";
import type { AIRecommendationRequest } from "@/services/ai/types";

/**
 * System instructions: strictly bounded to v1 planner universe (no new pipelines, no open biology QA).
 */
export function buildLavaSystemPrompt(request: AIRecommendationRequest): string {
  const catalog =
    request.functionCatalog && request.functionCatalog.length > 0
      ? request.functionCatalog
      : buildPlannerFunctionCatalog(request.availablePipelines);
  const allowedPipelineIds = getSupportedPlannerPipelineIds();
  return [
    "You are a workflow planning assistant inside a desktop biology analysis application.",
    "You MUST NOT invent pipelines, tools, or analysis families outside the allowed list.",
    "You MUST NOT answer general biology questions, literature review, or unrelated tasks.",
    "Reply with a single JSON object only (no markdown, no prose outside JSON).",
    "",
    "Allowed pipeline ids (choose one for supported recommendations):",
    JSON.stringify(allowedPipelineIds),
    "",
    "Allowed planner function catalog (reference only; the app materializes calls deterministically):",
    JSON.stringify(catalog),
    "",
    "Output schema (pick exactly one):",
    "A) Supported:",
    JSON.stringify({
      kind: "supported",
      chosenPipelineId: "count-matrix-analysis-v1 | bulk-rna-matrix-downstream-v1",
      selectedModifications: "<optional record of pipeline modification slot id -> option id>",
      skippedStepIds: "<optional string[] of step ids to skip>",
      skipDifferentialDueToInvalidGrouping: "<optional boolean>",
      preferTmmLikeNormalization: "<optional boolean; bulk matrix downstream only>",
      explanations: "<optional structured explanation entries>",
      warnings: "<optional string[]>",
      assumptions: "<optional string[]>",
    }),
    "",
    "B) Unsupported (request cannot be met within the allowed pipelines):",
    JSON.stringify({
      kind: "unsupported",
      unsupportedReasonCode: "outside-supported-universe | missing-required-matrix-context | supported-pipelines-unavailable",
      summary: "<short user-facing summary>",
      reason: "<detail>",
      closestSupportedPipelineId: "<null or one of the allowed pipeline ids>",
      warnings: "<optional string[]>",
      assumptions: "<optional string[]>",
    }),
    "",
    "Selection guidance:",
    "- bulk-rna-matrix-downstream-v1: PCA, volcano plots, downstream matrix exploration beyond basic count-matrix DE.",
    "- count-matrix-analysis-v1: matrix + metadata + differential expression without emphasizing PCA/volcano-only workflows.",
    "- If the user asks for single-cell, spatial, alignment-from-FASTQ, pathways-only, or other families: return kind unsupported with outside-supported-universe.",
  ].join("\n");
}

export function buildLavaUserPrompt(userPrompt: string): string {
  return ["User request:", userPrompt.trim()].join("\n");
}
