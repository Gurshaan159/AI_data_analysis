import { validatePlannerResultPolicy } from "@/services/ai/planner/policyValidator";
import { validatePlannerResultRuntime } from "@/services/ai/planner/runtimeValidator";
import type { PlannerAcceptanceResult, PlannerValidationIssue } from "@/services/ai/planner/validationTypes";
import type {
  PipelineDefinition,
  PlannerFunctionCatalogEntry,
  UnsupportedRecommendationResult,
  UnsupportedReasonCode,
} from "@/shared/types";

interface AcceptanceContext {
  availablePipelines: PipelineDefinition[];
  functionCatalog: PlannerFunctionCatalogEntry[];
  providerLabel: string;
}

function toFailureReasonCode(stage: "runtime-schema" | "policy"): UnsupportedReasonCode {
  return stage === "runtime-schema" ? "invalid-provider-output-shape" : "planner-policy-violation";
}

function toSummary(stage: "runtime-schema" | "policy"): string {
  return stage === "runtime-schema"
    ? "Planner output failed runtime schema validation."
    : "Planner output failed policy validation.";
}

function buildFailureResult(
  stage: "runtime-schema" | "policy",
  providerLabel: string,
  issues: PlannerValidationIssue[],
): UnsupportedRecommendationResult {
  const maxIssueLines = 4;
  const issueLines = issues.slice(0, maxIssueLines).map((issue) => `${issue.path || "root"}: ${issue.message}`);
  const reason =
    issueLines.length > 0
      ? `Provider ${providerLabel} returned planner output blocked at ${stage}. ${issueLines.join(" | ")}`
      : `Provider ${providerLabel} returned planner output blocked at ${stage}.`;

  return {
    kind: "unsupported",
    recommendationId: `planner-validation-failure-${Date.now()}`,
    unsupportedReasonCode: toFailureReasonCode(stage),
    summary: toSummary(stage),
    reason,
    closestSupportedPipelineId: null,
    plannerFunctionCalls: [
      {
        functionId: "detect_unsupported_request",
        arguments: {
          reasonCode: toFailureReasonCode(stage),
          reason,
        },
      },
    ],
    explanations: [
      {
        id: `planner-validation-${stage}`,
        kind: "fallback",
        title: `Planner ${stage} failure`,
        detail: reason,
        sourceFunctionId: "detect_unsupported_request",
      },
    ],
    warnings: [`Planner result blocked by ${stage} guardrail.`],
    assumptions: ["Broken planner output is treated as unsupported in v1 guardrail mode."],
    suggestedResources: [
      {
        id: "planner-validation-note",
        title: "Planner validation safeguard",
        description: "The planner output was rejected before entering approval flow because it violated validation guardrails.",
        resourceType: "scope-note",
      },
    ],
  };
}

export function acceptProviderPlannerResult(providerResult: unknown, context: AcceptanceContext): PlannerAcceptanceResult {
  if (providerResult === null || providerResult === undefined) {
    return {
      accepted: true,
      result: null,
    };
  }

  const runtime = validatePlannerResultRuntime(providerResult, {
    availablePipelines: context.availablePipelines,
  });
  if (!runtime.ok) {
    return {
      accepted: false,
      failedStage: "runtime-schema",
      issues: runtime.issues,
      result: buildFailureResult("runtime-schema", context.providerLabel, runtime.issues),
    };
  }

  const policy = validatePlannerResultPolicy(runtime.value, {
    availablePipelines: context.availablePipelines,
    functionCatalog: context.functionCatalog,
  });
  if (!policy.ok) {
    return {
      accepted: false,
      failedStage: "policy",
      issues: policy.issues,
      result: buildFailureResult("policy", context.providerLabel, policy.issues),
    };
  }

  return {
    accepted: true,
    result: policy.value,
  };
}
