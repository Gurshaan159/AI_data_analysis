use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

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

/// Snapshot of one output path after a successful scripted pipeline run, for `run-provenance.json`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CompletedArtifactRecord {
    /// Path relative to the per-run output directory, `/`-separated and stable across platforms.
    pub relative_path: String,
    pub size_bytes: u64,
    /// Whether the path existed and was readable when the snapshot was taken.
    pub exists: bool,
}

/// Builds a sorted, deduplicated artifact list for provenance. Paths must exist under `run_output_dir`.
pub fn build_completed_artifact_records(
    run_output_dir: &Path,
    produced_files: &[PathBuf],
) -> Result<Vec<CompletedArtifactRecord>, std::io::Error> {
    let run_dir = run_output_dir.canonicalize()?;
    let mut seen = HashSet::<PathBuf>::new();
    let mut records = Vec::new();

    for original in produced_files {
        let canon = original.canonicalize()?;
        if !seen.insert(canon.clone()) {
            continue;
        }
        let rel = canon.strip_prefix(&run_dir).map_err(|_| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "artifact path '{}' is not under run directory '{}'",
                    canon.display(),
                    run_dir.display()
                ),
            )
        })?;
        let relative_path = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        let meta = fs::metadata(&canon)?;
        let (size_bytes, exists) = if meta.is_file() {
            (meta.len(), true)
        } else if meta.is_dir() {
            (0, true)
        } else {
            (0, false)
        };
        records.push(CompletedArtifactRecord {
            relative_path,
            size_bytes,
            exists,
        });
    }

    records.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(records)
}

#[cfg(test)]
mod artifact_record_tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::build_completed_artifact_records;

    fn temp_run_dir(prefix: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{stamp}"));
        fs::create_dir_all(&path).expect("temp directory should be creatable");
        path
    }

    #[test]
    fn artifact_records_are_sorted_and_use_forward_slash_relative_paths() {
        let run_dir = temp_run_dir("artifact-records-rel");
        let a = run_dir.join("z_last.txt");
        let nested = run_dir.join("nested");
        fs::create_dir_all(&nested).expect("nested dir");
        let b = nested.join("first.txt");
        fs::write(&a, "a").expect("write");
        fs::write(&b, "bb").expect("write");

        let records = build_completed_artifact_records(
            &run_dir,
            &[a.clone(), b.clone()],
        )
        .expect("records should build");

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].relative_path, "nested/first.txt");
        assert_eq!(records[0].size_bytes, 2);
        assert!(records[0].exists);
        assert_eq!(records[1].relative_path, "z_last.txt");
        assert_eq!(records[1].size_bytes, 1);
    }

    #[test]
    fn duplicate_canonical_paths_appear_once() {
        let run_dir = temp_run_dir("artifact-records-dedupe");
        let f = run_dir.join("out.tsv");
        fs::write(&f, "x").expect("write");

        let records = build_completed_artifact_records(&run_dir, &[f.clone(), f]).expect("ok");
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].relative_path, "out.tsv");
    }
}
