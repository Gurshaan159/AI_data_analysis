use crate::shared::types::{
    PipelineDefinition, PipelineFamily, ValidationRequirement, WorkflowStepDefinition,
};

pub fn default_registry() -> Vec<PipelineDefinition> {
    vec![PipelineDefinition {
        id: "rna-seq-standard-v1".to_string(),
        name: "RNA-seq Standard".to_string(),
        family: PipelineFamily::RnaSeq,
        summary: "Baseline bulk RNA-seq differential expression workflow scaffold.".to_string(),
        supported_inputs: vec!["FASTQ_PAIR".to_string(), "SAMPLE_SHEET_CSV".to_string()],
        supported_outputs: vec!["QC_REPORT".to_string(), "DIFF_EXPRESSION_TABLE".to_string()],
        allowed_tools: vec![
            "fastqc".to_string(),
            "star".to_string(),
            "featurecounts".to_string(),
            "deseq2".to_string(),
        ],
        validation_requirements: vec![ValidationRequirement {
            id: "paired-fastq".to_string(),
            description: "Input FASTQ files must be paired per sample.".to_string(),
            rule: "each sample has R1 and R2 entries".to_string(),
        }],
        workflow_steps: vec![
            WorkflowStepDefinition {
                id: "qc".to_string(),
                label: "Quality Control".to_string(),
                description: "Assess read-level quality and sample-level consistency.".to_string(),
                tool_key: "fastqc".to_string(),
                required: true,
                optional_modification_slot: false,
            },
            WorkflowStepDefinition {
                id: "align".to_string(),
                label: "Alignment".to_string(),
                description: "Map reads against configured reference build.".to_string(),
                tool_key: "star".to_string(),
                required: true,
                optional_modification_slot: false,
            },
            WorkflowStepDefinition {
                id: "quantify".to_string(),
                label: "Quantification".to_string(),
                description: "Generate gene-level count matrix.".to_string(),
                tool_key: "featurecounts".to_string(),
                required: true,
                optional_modification_slot: false,
            },
            WorkflowStepDefinition {
                id: "stats".to_string(),
                label: "Statistical Analysis".to_string(),
                description: "Perform differential expression analysis.".to_string(),
                tool_key: "deseq2".to_string(),
                required: true,
                optional_modification_slot: true,
            },
        ],
    }]
}
