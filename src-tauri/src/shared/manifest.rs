use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunManifest {
    pub manifest_version: String,
    pub manifest_id: String,
    pub created_at_iso: String,
    pub pipeline: ManifestPipelineMetadata,
    pub inputs: Vec<ManifestInputDescriptor>,
    pub output: ManifestOutputLocation,
    pub workflow: ManifestWorkflow,
    pub execution_plan: ManifestExecutionPlan,
    pub provenance: ManifestProvenance,
    pub environment: ManifestEnvironmentPlaceholder,
    pub runtime: ManifestRuntimePlaceholder,
}

#[derive(Debug, Clone)]
pub struct ValidatedRunManifest {
    manifest: RunManifest,
}

impl ValidatedRunManifest {
    pub(crate) fn new(manifest: RunManifest) -> Self {
        Self { manifest }
    }

    pub fn manifest(&self) -> &RunManifest {
        &self.manifest
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestPipelineMetadata {
    pub pipeline_id: String,
    pub approved_at_iso: String,
    pub execution_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestInputDescriptor {
    pub input_id: String,
    pub kind: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestOutputLocation {
    pub directory: String,
    pub expected_artifacts: Vec<ManifestExpectedArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestWorkflow {
    pub steps: Vec<ManifestWorkflowStep>,
    pub selected_modifications: Vec<ManifestModificationDecision>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestWorkflowStep {
    pub step_index: usize,
    pub step_id: String,
    pub label: String,
    pub category: String,
    pub required: bool,
    pub explanation: String,
    pub added_by_ai: bool,
    pub modified_by_ai: bool,
    pub expected_artifacts: Vec<ManifestExpectedArtifact>,
    pub configuration: ManifestStepConfiguration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestStepConfiguration {
    pub parameter_changes: Vec<ManifestParameterChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestParameterChange {
    pub parameter_key: String,
    pub previous_value: String,
    pub next_value: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestModificationDecision {
    pub slot_id: String,
    pub slot_label: String,
    pub selected_option_id: String,
    pub selected_option_label: String,
    pub effect_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestExpectedArtifact {
    pub artifact_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestExecutionPlan {
    pub stages: Vec<ManifestExecutionStage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestExecutionStage {
    pub stage_id: String,
    pub order_index: usize,
    pub step_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestProvenance {
    pub source_kind: String,
    pub source_pipeline_id: String,
    pub selected_modification_slots: Vec<String>,
    pub input_descriptor_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEnvironmentPlaceholder {
    pub os: Option<String>,
    pub tool_versions: Vec<ManifestToolVersionPlaceholder>,
    pub environment_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestToolVersionPlaceholder {
    pub tool_key: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestRuntimePlaceholder {
    pub runtime_kind: Option<String>,
    pub container_image: Option<String>,
    pub workflow_engine: Option<String>,
}
