import type { PlannerIntentSignals } from "@/shared/types";
import { createEmptyIntentSignals, type IntentExtractionResult } from "@/services/ai/intent/intentTypes";

function normalizePrompt(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ");
}

function hasAnyPhrase(prompt: string, phrases: string[]): boolean {
  return phrases.some((phrase) => prompt.includes(phrase));
}

const PHRASES = {
  matrixData: ["count matrix", "matrix", "counts", "gene-by-sample", "expression matrix"],
  metadata: ["metadata", "meta data", "sample sheet", "sample annotation", "condition table"],
  groupComparison: [
    "treatment vs control",
    "vs control",
    "compare groups",
    "between conditions",
    "condition groups",
    "differential expression",
    "contrast",
  ],
  unsureGrouping: ["no groups", "without groups", "single group", "ungrouped", "no condition labels", "unsure grouping"],
  dimensionality: ["pca", "dimensionality reduction"],
  normalization: ["normalize", "normalization", "size factor", "tmm", "composition bias", "imbalanced"],
  visualization: ["plot", "visualization", "visualize", "volcano"],
  wantsPca: ["pca", "principal component"],
  wantsDifferentialExpression: ["differential expression", "de analysis", "contrast", "treatment vs control", "between conditions"],
  wantsVolcanoPlot: ["volcano", "volcano plot"],
  wantsSummaryReport: ["summary report", "summary", "report"],
  basicAnalysis: ["basic analysis", "quick analysis", "standard analysis", "baseline analysis"],
  comparisonFraming: ["compare", "comparison", "between conditions", "treatment", "control"],
  unsureAnalysis: ["not sure", "unsure", "don't know", "help me choose", "what should i run"],
  recommendation: ["recommend", "suggest", "workflow suggestion", "help me choose", "what should i run"],
  unsupportedAnalysis: [
    "single cell",
    "single-cell",
    "scrna",
    "spatial transcriptomics",
    "spatial rna",
    "peak calling",
    "chip",
    "atac",
    "methylation",
    "metabolomics",
    "fastq alignment",
    "raw fastq",
    "align reads",
    "protein folding",
    "literature review",
  ],
};

function deriveSignalDefaults(signals: PlannerIntentSignals): PlannerIntentSignals {
  const next = {
    ...signals,
    dataCharacteristics: { ...signals.dataCharacteristics },
    desiredOutputs: { ...signals.desiredOutputs },
    problemFraming: { ...signals.problemFraming },
    constraints: { ...signals.constraints },
  };

  if (next.desiredOutputs.wantsPca) {
    next.dataCharacteristics.expectsDimensionalityReduction = true;
  }
  if (next.desiredOutputs.wantsVolcanoPlot) {
    next.dataCharacteristics.expectsVisualization = true;
    next.desiredOutputs.wantsDifferentialExpression = true;
    next.dataCharacteristics.expectsGroupComparison = true;
  }
  if (next.problemFraming.wantsComparisonBetweenConditions || next.desiredOutputs.wantsDifferentialExpression) {
    next.dataCharacteristics.expectsGroupComparison = true;
  }
  if (next.dataCharacteristics.expectsGroupComparison) {
    next.problemFraming.wantsComparisonBetweenConditions = true;
  }
  if (next.constraints.ambiguousInputDescription && !next.constraints.unsupportedAnalysisRequested) {
    next.problemFraming.wantsRecommendation = true;
    next.problemFraming.unsureWhatAnalysisToRun = true;
    next.problemFraming.wantsBasicAnalysis = true;
  }
  return next;
}

export function extractPlannerIntentSignals(userPrompt: string): IntentExtractionResult {
  const normalizedPrompt = normalizePrompt(userPrompt);
  const signals = createEmptyIntentSignals();

  signals.dataCharacteristics.hasMatrixData = hasAnyPhrase(normalizedPrompt, PHRASES.matrixData);
  signals.dataCharacteristics.hasMetadata = hasAnyPhrase(normalizedPrompt, PHRASES.metadata);
  signals.dataCharacteristics.expectsGroupComparison = hasAnyPhrase(normalizedPrompt, PHRASES.groupComparison);
  signals.dataCharacteristics.unsureAboutGrouping = hasAnyPhrase(normalizedPrompt, PHRASES.unsureGrouping);
  signals.dataCharacteristics.expectsDimensionalityReduction = hasAnyPhrase(normalizedPrompt, PHRASES.dimensionality);
  signals.dataCharacteristics.expectsNormalization = hasAnyPhrase(normalizedPrompt, PHRASES.normalization);
  signals.dataCharacteristics.expectsVisualization = hasAnyPhrase(normalizedPrompt, PHRASES.visualization);

  signals.desiredOutputs.wantsPca = hasAnyPhrase(normalizedPrompt, PHRASES.wantsPca);
  signals.desiredOutputs.wantsDifferentialExpression = hasAnyPhrase(normalizedPrompt, PHRASES.wantsDifferentialExpression);
  signals.desiredOutputs.wantsVolcanoPlot = hasAnyPhrase(normalizedPrompt, PHRASES.wantsVolcanoPlot);
  signals.desiredOutputs.wantsSummaryReport = hasAnyPhrase(normalizedPrompt, PHRASES.wantsSummaryReport);

  signals.problemFraming.wantsBasicAnalysis = hasAnyPhrase(normalizedPrompt, PHRASES.basicAnalysis);
  signals.problemFraming.wantsComparisonBetweenConditions = hasAnyPhrase(normalizedPrompt, PHRASES.comparisonFraming);
  signals.problemFraming.unsureWhatAnalysisToRun = hasAnyPhrase(normalizedPrompt, PHRASES.unsureAnalysis);
  signals.problemFraming.wantsRecommendation = hasAnyPhrase(normalizedPrompt, PHRASES.recommendation);

  signals.constraints.unsupportedAnalysisRequested = hasAnyPhrase(normalizedPrompt, PHRASES.unsupportedAnalysis);
  signals.constraints.ambiguousInputDescription = !signals.dataCharacteristics.hasMatrixData && !signals.dataCharacteristics.hasMetadata;

  return {
    normalizedPrompt,
    signals: deriveSignalDefaults(signals),
  };
}
