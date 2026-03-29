use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionMode {
    MockLocal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RunPhase {
    Queued,
    Validating,
    Preparing,
    RunningStep,
    Finalizing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedFile {
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowParameterChangePayload {
    pub parameter_key: String,
    pub previous_value: String,
    pub next_value: String,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStepPayload {
    pub step_id: String,
    pub display_label: String,
    pub category: String,
    pub required: bool,
    pub added_by_ai: bool,
    pub modified_by_ai: bool,
    pub explanation: String,
    pub parameter_change_summary: Vec<WorkflowParameterChangePayload>,
    pub expected_outputs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModificationOptionPayload {
    pub id: String,
    pub label: String,
    pub effect_summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModificationSlotPayload {
    pub id: String,
    pub label: String,
    pub supported_options: Vec<ModificationOptionPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowPayload {
    pub steps: Vec<WorkflowStepPayload>,
    pub modification_slots: Vec<ModificationSlotPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedWorkflowPayload {
    pub pipeline_id: String,
    pub approved_at_iso: String,
    pub workflow: WorkflowPayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunRequest {
    pub selected_pipeline_id: String,
    pub selected_files: Vec<SelectedFile>,
    pub output_folder: String,
    pub approved_workflow: ApprovedWorkflowPayload,
    pub selected_modifications: HashMap<String, String>,
    pub execution_mode: ExecutionMode,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStartResponse {
    pub run_id: String,
    pub initial_phase: RunPhase,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProgressEvent {
    pub run_id: String,
    pub phase: RunPhase,
    pub message: String,
    pub step_id: Option<String>,
    pub step_label: Option<String>,
    pub progress_index: usize,
    pub total_progress: usize,
}
