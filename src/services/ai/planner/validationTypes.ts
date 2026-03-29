import type { AIRecommendationResult, UnsupportedRecommendationResult } from "@/shared/types";

export type PlannerValidationStage = "runtime-schema" | "policy";

export interface PlannerValidationIssue {
  stage: PlannerValidationStage;
  code: string;
  path: string;
  message: string;
}

export type PlannerValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      issues: PlannerValidationIssue[];
    };

export type PlannerAcceptanceResult =
  | {
      accepted: true;
      result: AIRecommendationResult | null;
    }
  | {
      accepted: false;
      failedStage: PlannerValidationStage;
      issues: PlannerValidationIssue[];
      result: UnsupportedRecommendationResult;
    };
