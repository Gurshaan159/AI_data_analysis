import type { PlannerIntentSignals } from "@/shared/types";

export interface IntentExtractionResult {
  normalizedPrompt: string;
  signals: PlannerIntentSignals;
}

export function createEmptyIntentSignals(): PlannerIntentSignals {
  return {
    dataCharacteristics: {
      hasMatrixData: false,
      hasMetadata: false,
      expectsGroupComparison: false,
      unsureAboutGrouping: false,
      expectsDimensionalityReduction: false,
      expectsNormalization: false,
      expectsVisualization: false,
    },
    desiredOutputs: {
      wantsPca: false,
      wantsDifferentialExpression: false,
      wantsVolcanoPlot: false,
      wantsSummaryReport: false,
    },
    problemFraming: {
      wantsBasicAnalysis: false,
      wantsComparisonBetweenConditions: false,
      unsureWhatAnalysisToRun: false,
      wantsRecommendation: false,
    },
    constraints: {
      ambiguousInputDescription: false,
      unsupportedAnalysisRequested: false,
    },
  };
}

export function summarizeIntentSignals(signals: PlannerIntentSignals): string[] {
  const summaries: string[] = [];
  if (signals.dataCharacteristics.hasMatrixData) {
    summaries.push("Detected matrix-style data description.");
  }
  if (signals.dataCharacteristics.hasMetadata) {
    summaries.push("Detected metadata requirement.");
  }
  if (signals.problemFraming.wantsComparisonBetweenConditions || signals.dataCharacteristics.expectsGroupComparison) {
    summaries.push("Detected request for comparison between conditions.");
  }
  if (signals.dataCharacteristics.expectsDimensionalityReduction || signals.desiredOutputs.wantsPca) {
    summaries.push("Detected desire for dimensionality reduction output.");
  }
  if (signals.desiredOutputs.wantsVolcanoPlot) {
    summaries.push("Detected request for volcano-plot visualization.");
  }
  if (signals.problemFraming.wantsRecommendation || signals.problemFraming.unsureWhatAnalysisToRun) {
    summaries.push("Detected recommendation-oriented intent.");
  }
  if (signals.constraints.ambiguousInputDescription) {
    summaries.push("Input description is ambiguous for file requirements.");
  }
  if (signals.constraints.unsupportedAnalysisRequested) {
    summaries.push("Detected request outside bounded v1 analysis families.");
  }
  return summaries;
}
