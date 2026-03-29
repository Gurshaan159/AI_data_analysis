import type { PipelineId } from "@/shared/types/pipeline";
import type { NormalizedWorkflow, WorkflowParameterChange, WorkflowStep } from "@/shared/types/workflow";

export interface SuggestedResource {
  id: string;
  title: string;
  citation: string;
  url: string;
}

export interface SupportedRecommendationResult {
  kind: "supported";
  recommendationId: string;
  chosenPipelineId: PipelineId;
  suggestedWorkflow: NormalizedWorkflow;
  addedSteps: WorkflowStep[];
  modifiedSteps: WorkflowStep[];
  changedParameters: WorkflowParameterChange[];
  explanations: string[];
  warnings: string[];
  assumptions: string[];
  suggestedResources: SuggestedResource[];
}

export interface UnsupportedRecommendationResult {
  kind: "unsupported";
  recommendationId: string;
  summary: string;
  reason: string;
  warnings: string[];
  assumptions: string[];
  suggestedResources: SuggestedResource[];
}

export type AIRecommendationResult = SupportedRecommendationResult | UnsupportedRecommendationResult;
export type AIRecommendationStatus = "idle" | "loading" | "supported" | "unsupported" | "error";
