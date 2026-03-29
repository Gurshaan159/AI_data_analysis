use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PipelineFamily {
    RnaSeq,
    DnaVariant,
    SingleCell,
    Metagenomics,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRequirement {
    pub id: String,
    pub description: String,
    pub rule: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStepDefinition {
    pub id: String,
    pub label: String,
    pub description: String,
    pub tool_key: String,
    pub required: bool,
    pub optional_modification_slot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineDefinition {
    pub id: String,
    pub name: String,
    pub family: PipelineFamily,
    pub summary: String,
    pub supported_inputs: Vec<String>,
    pub supported_outputs: Vec<String>,
    pub allowed_tools: Vec<String>,
    pub validation_requirements: Vec<ValidationRequirement>,
    pub workflow_steps: Vec<WorkflowStepDefinition>,
}
