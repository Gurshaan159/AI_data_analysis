import type { PipelineDefinition, PipelineId } from "@/shared/types";

const REGISTRY: Record<PipelineId, PipelineDefinition> = {
  "bulk-rna-seq-v1": {
    id: "bulk-rna-seq-v1",
    familyId: "rna-seq",
    displayName: "Bulk RNA-seq",
    shortDescription: "Differential expression workflow for paired-end bulk RNA-seq studies.",
    supportedInputKinds: [
      { kind: "fastq", minFiles: 2, description: "Paired-end FASTQ files (R1 and R2)." },
      { kind: "metadata", minFiles: 1, description: "Sample metadata table with condition labels." },
    ],
    supportedOutputKinds: ["qc-report", "normalized-count-matrix", "differential-expression-table", "summary-report"],
    defaultWorkflowSteps: [
      {
        id: "bulk-rna-qc",
        displayLabel: "Read and Sample Quality Control",
        category: "quality-control",
        required: true,
        explanation: "Assess read quality and sample-level consistency before alignment.",
        expectedOutputs: ["qc-report"],
      },
      {
        id: "bulk-rna-align",
        displayLabel: "Transcriptome Alignment",
        category: "alignment",
        required: true,
        explanation: "Map reads to the reference transcriptome.",
        expectedOutputs: ["normalized-count-matrix"],
      },
      {
        id: "bulk-rna-quantify",
        displayLabel: "Gene-Level Quantification",
        category: "quantification",
        required: true,
        explanation: "Build a count matrix from aligned reads.",
        expectedOutputs: ["normalized-count-matrix"],
      },
      {
        id: "bulk-rna-de",
        displayLabel: "Differential Expression Modeling",
        category: "statistical-analysis",
        required: true,
        explanation: "Fit contrasts and estimate differentially expressed genes.",
        expectedOutputs: ["differential-expression-table", "summary-report"],
      },
    ],
    modificationSlots: [
      {
        id: "bulk-rna-reference-build",
        label: "Reference Build",
        description: "Reference build used for alignment and quantification.",
        category: "reference",
        supportedOptions: [
          { id: "grch38", label: "GRCh38", effectSummary: "Default modern human reference build." },
          { id: "grcm39", label: "GRCm39", effectSummary: "Mouse reference build for murine datasets." },
        ],
        defaultOptionId: "grch38",
        editAvailability: "now",
        aiCanChange: true,
        effectSummary: "Changes alignment target and downstream annotation context.",
      },
      {
        id: "bulk-rna-stringency",
        label: "QC Stringency",
        description: "How aggressively low-quality reads/samples are filtered.",
        category: "quality-threshold",
        supportedOptions: [
          { id: "standard", label: "Standard", effectSummary: "Balanced baseline filtering." },
          { id: "strict", label: "Strict", effectSummary: "Removes more low-quality reads and samples." },
        ],
        defaultOptionId: "standard",
        editAvailability: "now",
        aiCanChange: true,
        effectSummary: "Impacts read retention and sensitivity/specificity tradeoff.",
      },
    ],
    validationRequirements: [
      {
        id: "bulk-rna-metadata-required",
        description: "Sample metadata is required for contrasts and sample grouping.",
        requiredMetadataFields: ["sample_id", "condition"],
        approvalRequired: true,
      },
    ],
    recommendedUseCases: [
      "Condition-vs-condition differential expression in bulk tissue data.",
      "Predefined cohort RNA-seq studies with clear sample metadata.",
    ],
    constraints: ["Not designed for single-cell barcoded libraries.", "Not designed for methylation-only analyses."],
  },
  "bulk-rna-matrix-downstream-v1": {
    id: "bulk-rna-matrix-downstream-v1",
    familyId: "rna-seq",
    displayName: "Bulk RNA-seq (Matrix Downstream)",
    shortDescription: "Matrix-first bulk RNA downstream workflow with normalization, PCA, and differential outputs.",
    supportedInputKinds: [
      { kind: "matrix", minFiles: 1, description: "Gene-by-sample count matrix." },
      { kind: "metadata", minFiles: 1, description: "Sample metadata table with condition or group column." },
    ],
    supportedOutputKinds: [
      "normalized-count-matrix",
      "differential-expression-table",
      "volcano-plot",
      "summary-report",
    ],
    defaultWorkflowSteps: [
      {
        id: "bulk-matrix-validate",
        displayLabel: "Bulk Matrix and Metadata Validation",
        category: "preprocessing",
        required: true,
        explanation: "Validate count-matrix structure and ensure metadata group labels are usable.",
        expectedOutputs: ["summary-report"],
      },
      {
        id: "bulk-matrix-normalize",
        displayLabel: "Bulk RNA Normalization and PCA",
        category: "normalization",
        required: true,
        explanation: "Perform normalization and produce PCA coordinates/plot for sample-level separation.",
        expectedOutputs: ["normalized-count-matrix", "summary-report"],
      },
      {
        id: "bulk-matrix-model",
        displayLabel: "Bulk RNA Differential Expression",
        category: "statistical-analysis",
        required: true,
        explanation: "Compute differential expression contrasts and generate volcano summary.",
        expectedOutputs: ["differential-expression-table", "volcano-plot", "summary-report"],
      },
    ],
    modificationSlots: [
      {
        id: "bulk-matrix-normalization-choice",
        label: "Normalization Method",
        description: "Normalization method for matrix scaling before differential comparison.",
        category: "normalization",
        supportedOptions: [
          { id: "size-factor", label: "Size Factor", effectSummary: "General-purpose count scaling." },
          { id: "tmm-like", label: "TMM-Like", effectSummary: "Robust to composition differences." },
        ],
        defaultOptionId: "size-factor",
        editAvailability: "now",
        aiCanChange: true,
        effectSummary: "Affects normalization baseline before PCA and differential summaries.",
      },
    ],
    validationRequirements: [
      {
        id: "bulk-matrix-metadata-required",
        description: "Metadata must include sample IDs and condition/group assignments for differential comparison.",
        requiredMetadataFields: ["sample_id", "condition"],
        approvalRequired: true,
      },
    ],
    recommendedUseCases: [
      "Bulk RNA differential analysis from precomputed count matrices.",
      "Downstream exploratory PCA and contrast summaries without raw FASTQ processing.",
    ],
    constraints: [
      "No raw FASTQ alignment/quantification in this pipeline.",
      "Requires metadata group labels for differential outputs.",
    ],
  },
  "scrna-seq-v1": {
    id: "scrna-seq-v1",
    familyId: "single-cell",
    displayName: "scRNA-seq",
    shortDescription: "Matrix-first single-cell clustering and marker discovery baseline.",
    supportedInputKinds: [
      { kind: "matrix", minFiles: 1, description: "Expression matrix with cell-by-feature counts." },
      { kind: "metadata", minFiles: 1, description: "Cell-level metadata table." },
    ],
    supportedOutputKinds: ["qc-report", "cluster-markers", "summary-report"],
    defaultWorkflowSteps: [
      {
        id: "scrna-matrix-qc",
        displayLabel: "Cell Matrix Quality Control",
        category: "quality-control",
        required: true,
        explanation: "Filter low-quality cells and low-information features.",
        expectedOutputs: ["qc-report"],
      },
      {
        id: "scrna-normalize",
        displayLabel: "Single-Cell Normalization",
        category: "normalization",
        required: true,
        explanation: "Normalize count depth across cells for comparable analysis.",
        expectedOutputs: ["normalized-count-matrix"],
      },
      {
        id: "scrna-cluster",
        displayLabel: "Clustering and Marker Discovery",
        category: "clustering",
        required: true,
        explanation: "Identify cell clusters and marker genes.",
        expectedOutputs: ["cluster-markers", "summary-report"],
      },
    ],
    modificationSlots: [
      {
        id: "scrna-normalization",
        label: "Normalization Strategy",
        description: "Normalization approach before dimensionality reduction.",
        category: "normalization",
        supportedOptions: [
          { id: "log-normalize", label: "Log Normalize", effectSummary: "Fast and common baseline." },
          { id: "sctransform-like", label: "Variance Stabilizing", effectSummary: "Improves robustness to depth." },
        ],
        defaultOptionId: "log-normalize",
        editAvailability: "now",
        aiCanChange: true,
        effectSummary: "Impacts downstream clustering separation and marker stability.",
      },
    ],
    validationRequirements: [
      {
        id: "scrna-metadata-required",
        description: "Cell metadata is required for cluster interpretation.",
        requiredMetadataFields: ["cell_id", "sample_id"],
        approvalRequired: true,
      },
    ],
    recommendedUseCases: [
      "Single-cell exploratory clustering from expression matrix inputs.",
      "Marker-gene discovery workflows when matrix preprocessing already exists.",
    ],
    constraints: ["Current scaffold expects matrix input, not raw FASTQ demultiplexing.", "No trajectory inference yet."],
  },
  "atac-seq-v1": {
    id: "atac-seq-v1",
    familyId: "chromatin",
    displayName: "ATAC-seq",
    shortDescription: "Chromatin accessibility workflow with peak calling and accessibility summaries.",
    supportedInputKinds: [
      { kind: "fastq", minFiles: 2, description: "Paired-end FASTQ reads." },
      { kind: "metadata", minFiles: 1, description: "Sample metadata table." },
    ],
    supportedOutputKinds: ["peak-set", "accessibility-matrix", "summary-report"],
    defaultWorkflowSteps: [
      {
        id: "atac-qc",
        displayLabel: "Accessibility Read Quality Control",
        category: "quality-control",
        required: true,
        explanation: "Review fragment quality and enrichment proxies.",
        expectedOutputs: ["qc-report"],
      },
      {
        id: "atac-align",
        displayLabel: "Accessibility Alignment",
        category: "alignment",
        required: true,
        explanation: "Align ATAC reads to reference genome.",
        expectedOutputs: ["accessibility-matrix"],
      },
      {
        id: "atac-peaks",
        displayLabel: "Peak Calling",
        category: "peak-calling",
        required: true,
        explanation: "Identify open chromatin peaks.",
        expectedOutputs: ["peak-set", "summary-report"],
      },
    ],
    modificationSlots: [
      {
        id: "atac-peak-sensitivity",
        label: "Peak Sensitivity",
        description: "Stringency for accessibility peak calls.",
        category: "peak-calling",
        supportedOptions: [
          { id: "balanced", label: "Balanced", effectSummary: "Balanced precision and recall." },
          { id: "sensitive", label: "Sensitive", effectSummary: "Higher recall with more candidate peaks." },
        ],
        defaultOptionId: "balanced",
        editAvailability: "now",
        aiCanChange: true,
        effectSummary: "Changes number of detected peaks and noise profile.",
      },
    ],
    validationRequirements: [
      {
        id: "atac-metadata-required",
        description: "Metadata is required for grouped downstream interpretation.",
        requiredMetadataFields: ["sample_id", "condition"],
        approvalRequired: true,
      },
    ],
    recommendedUseCases: ["Bulk ATAC studies with paired-end reads.", "Condition-specific chromatin accessibility summaries."],
    constraints: ["No footprinting module yet.", "No integrated motif enrichment in scaffold mode."],
  },
  "chip-seq-v1": {
    id: "chip-seq-v1",
    familyId: "chromatin",
    displayName: "ChIP-seq",
    shortDescription: "Control-aware binding enrichment analysis with genomic annotation.",
    supportedInputKinds: [
      { kind: "fastq", minFiles: 2, description: "ChIP and control paired-end FASTQ reads." },
      { kind: "metadata", minFiles: 1, description: "Sample and control relationship metadata." },
    ],
    supportedOutputKinds: ["peak-set", "annotated-regions", "summary-report"],
    defaultWorkflowSteps: [
      {
        id: "chip-qc",
        displayLabel: "Immunoprecipitation QC",
        category: "quality-control",
        required: true,
        explanation: "Evaluate read quality and control readiness.",
        expectedOutputs: ["qc-report"],
      },
      {
        id: "chip-align",
        displayLabel: "Binding Alignment",
        category: "alignment",
        required: true,
        explanation: "Align ChIP and control reads against reference genome.",
        expectedOutputs: ["peak-set"],
      },
      {
        id: "chip-peak-call",
        displayLabel: "Control-Aware Peak Calling",
        category: "peak-calling",
        required: true,
        explanation: "Call enriched binding sites against matched controls.",
        expectedOutputs: ["peak-set"],
      },
      {
        id: "chip-annotate",
        displayLabel: "Binding Region Annotation",
        category: "annotation",
        required: true,
        explanation: "Annotate peak regions with nearby genomic context.",
        expectedOutputs: ["annotated-regions", "summary-report"],
      },
    ],
    modificationSlots: [
      {
        id: "chip-background-model",
        label: "Background Model",
        description: "Controls how background signal is handled for enrichment.",
        category: "analysis-depth",
        supportedOptions: [
          { id: "global", label: "Global Background", effectSummary: "Simpler baseline background model." },
          { id: "local", label: "Local Background", effectSummary: "Local model for better specificity." },
        ],
        defaultOptionId: "local",
        editAvailability: "later",
        aiCanChange: false,
        effectSummary: "Affects false positive control in peak calls.",
      },
    ],
    validationRequirements: [
      {
        id: "chip-metadata-required",
        description: "Control assignment metadata is required.",
        requiredMetadataFields: ["sample_id", "control_sample_id"],
        approvalRequired: true,
      },
    ],
    recommendedUseCases: ["Transcription factor occupancy analysis.", "Histone mark enrichment studies with controls."],
    constraints: ["No replicate-aware IDR logic yet.", "No external peak annotation databases integrated yet."],
  },
  "count-matrix-analysis-v1": {
    id: "count-matrix-analysis-v1",
    familyId: "matrix-analysis",
    displayName: "Count-Matrix Analysis",
    shortDescription: "Matrix-first differential modeling for precomputed count data.",
    supportedInputKinds: [
      { kind: "matrix", minFiles: 1, description: "Gene-by-sample count matrix." },
      { kind: "metadata", minFiles: 1, description: "Sample metadata for model design." },
    ],
    supportedOutputKinds: ["normalized-count-matrix", "differential-expression-table", "summary-report"],
    defaultWorkflowSteps: [
      {
        id: "matrix-validate",
        displayLabel: "Matrix and Metadata Validation",
        category: "preprocessing",
        required: true,
        explanation: "Validate matrix shape and sample metadata compatibility.",
        expectedOutputs: ["summary-report"],
      },
      {
        id: "matrix-normalize",
        displayLabel: "Count Normalization",
        category: "normalization",
        required: true,
        explanation: "Normalize counts for robust between-sample comparison.",
        expectedOutputs: ["normalized-count-matrix"],
      },
      {
        id: "matrix-model",
        displayLabel: "Differential Modeling",
        category: "statistical-analysis",
        required: true,
        explanation: "Fit contrasts and produce statistical result tables.",
        expectedOutputs: ["differential-expression-table", "summary-report"],
      },
    ],
    modificationSlots: [
      {
        id: "matrix-normalization-choice",
        label: "Normalization Method",
        description: "Normalization method for matrix scaling.",
        category: "normalization",
        supportedOptions: [
          { id: "size-factor", label: "Size Factor", effectSummary: "General-purpose count scaling." },
          { id: "tmm-like", label: "TMM-Like", effectSummary: "Robust to composition differences." },
        ],
        defaultOptionId: "size-factor",
        editAvailability: "now",
        aiCanChange: true,
        effectSummary: "Influences comparability across samples and model estimates.",
      },
    ],
    validationRequirements: [
      {
        id: "matrix-metadata-required",
        description: "Metadata table is required for design and contrasts.",
        requiredMetadataFields: ["sample_id", "condition"],
        approvalRequired: true,
      },
    ],
    recommendedUseCases: [
      "Differential analysis when counts were generated outside this app.",
      "Rapid matrix-first exploratory differential workflows.",
    ],
    constraints: ["No raw-read processing in this pipeline.", "No automatic batch correction step yet."],
  },
};

export function getPipelineRegistry(): PipelineDefinition[] {
  return Object.values(REGISTRY);
}

export function getPipelineById(pipelineId: PipelineId): PipelineDefinition | undefined {
  return REGISTRY[pipelineId];
}
