use std::collections::{BTreeMap, BTreeSet};

use crate::shared::manifest::{RunManifest, ValidatedRunManifest};

#[derive(Debug, Clone)]
pub struct ManifestPreflightIssue {
    pub code: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct ManifestPreflightSummary {
    pub total_steps: usize,
    pub total_inputs: usize,
    pub total_expected_artifacts: usize,
    pub warning_count: usize,
    pub error_count: usize,
}

#[derive(Debug, Clone)]
pub struct ManifestPreflightResult {
    pub valid: bool,
    pub errors: Vec<ManifestPreflightIssue>,
    pub warnings: Vec<ManifestPreflightIssue>,
    pub summary: ManifestPreflightSummary,
}

pub fn preflight_run_manifest(manifest: &RunManifest) -> ManifestPreflightResult {
    let mut errors: Vec<ManifestPreflightIssue> = Vec::new();
    let mut warnings: Vec<ManifestPreflightIssue> = Vec::new();

    if manifest.manifest_version.trim().is_empty() {
        errors.push(issue(
            "manifest-version-missing",
            "manifestVersion",
            "manifestVersion is required",
        ));
    }
    if manifest.manifest_id.trim().is_empty() {
        errors.push(issue(
            "manifest-id-missing",
            "manifestId",
            "manifestId is required",
        ));
    }
    if manifest.pipeline.pipeline_id.trim().is_empty() {
        errors.push(issue(
            "pipeline-id-missing",
            "pipeline.pipelineId",
            "pipelineId is required",
        ));
    }
    if manifest.output.directory.trim().is_empty() {
        errors.push(issue(
            "output-directory-missing",
            "output.directory",
            "output directory is required",
        ));
    }
    if manifest.workflow.steps.is_empty() {
        errors.push(issue(
            "workflow-steps-missing",
            "workflow.steps",
            "at least one workflow step is required",
        ));
    }

    let mut seen_step_ids = BTreeSet::new();
    for (index, step) in manifest.workflow.steps.iter().enumerate() {
        let base_field = format!("workflow.steps[{index}]");
        if step.step_id.trim().is_empty() {
            errors.push(issue(
                "step-id-missing",
                &format!("{base_field}.stepId"),
                "stepId is required",
            ));
        } else if !seen_step_ids.insert(step.step_id.clone()) {
            errors.push(issue(
                "step-id-duplicate",
                &format!("{base_field}.stepId"),
                "stepId values must be unique and stable",
            ));
        }
        if step.label.trim().is_empty() {
            errors.push(issue(
                "step-label-missing",
                &format!("{base_field}.label"),
                "step label is required",
            ));
        }
        if step.required
            && step
                .configuration
                .parameter_changes
                .iter()
                .any(|change| change.parameter_key.trim().is_empty())
        {
            errors.push(issue(
                "required-step-config-invalid",
                &format!("{base_field}.configuration.parameterChanges"),
                "required step has invalid parameter change entries",
            ));
        }
    }

    for (index, stage) in manifest.execution_plan.stages.iter().enumerate() {
        let expected_order = index + 1;
        if stage.order_index != expected_order {
            errors.push(issue(
                "stage-order-invalid",
                &format!("executionPlan.stages[{index}].orderIndex"),
                "execution stage order must be contiguous and start at 1",
            ));
        }
        if !seen_step_ids.contains(&stage.step_id) {
            errors.push(issue(
                "stage-step-reference-missing",
                &format!("executionPlan.stages[{index}].stepId"),
                "execution stage references a missing workflow stepId",
            ));
        }
    }

    let expected_from_steps = manifest
        .workflow
        .steps
        .iter()
        .flat_map(|step| {
            step.expected_artifacts
                .iter()
                .map(|artifact| artifact.artifact_key.clone())
        })
        .collect::<BTreeSet<_>>();
    let expected_global = manifest
        .output
        .expected_artifacts
        .iter()
        .map(|artifact| artifact.artifact_key.clone())
        .collect::<BTreeSet<_>>();
    if expected_from_steps != expected_global {
        errors.push(issue(
            "expected-artifacts-mismatch",
            "output.expectedArtifacts",
            "global expected artifacts must match artifacts derivable from workflow steps",
        ));
    }

    if has_duplicate_modification_slots(manifest) {
        errors.push(issue(
            "modification-slot-duplicate",
            "workflow.selectedModifications",
            "modification slot ids must be unique",
        ));
    }
    for (index, modification) in manifest.workflow.selected_modifications.iter().enumerate() {
        if modification.slot_id.trim().is_empty()
            || modification.selected_option_id.trim().is_empty()
        {
            errors.push(issue(
                "modification-selection-invalid",
                &format!("workflow.selectedModifications[{index}]"),
                "modification slot and selected option are required",
            ));
        }
    }

    if manifest.environment.os.is_none() {
        warnings.push(issue(
            "environment-os-placeholder",
            "environment.os",
            "environment OS metadata is not populated yet",
        ));
    }
    if manifest
        .environment
        .tool_versions
        .iter()
        .all(|tool| tool.version.is_none())
    {
        warnings.push(issue(
            "tool-version-placeholders",
            "environment.toolVersions",
            "tool versions are placeholders and not pinned yet",
        ));
    }
    if manifest.runtime.runtime_kind.is_none() {
        warnings.push(issue(
            "runtime-placeholder",
            "runtime.runtimeKind",
            "runtime metadata is not populated yet",
        ));
    }

    if serde_json::to_string(manifest).is_err() {
        errors.push(issue(
            "manifest-not-serializable",
            "manifest",
            "manifest cannot be serialized to JSON",
        ));
    }

    let summary = ManifestPreflightSummary {
        total_steps: manifest.workflow.steps.len(),
        total_inputs: manifest.inputs.len(),
        total_expected_artifacts: manifest.output.expected_artifacts.len(),
        warning_count: warnings.len(),
        error_count: errors.len(),
    };

    ManifestPreflightResult {
        valid: errors.is_empty(),
        errors,
        warnings,
        summary,
    }
}

pub fn validate_run_manifest(
    manifest: RunManifest,
) -> Result<(ValidatedRunManifest, ManifestPreflightResult), ManifestPreflightResult> {
    let result = preflight_run_manifest(&manifest);
    if result.valid {
        Ok((ValidatedRunManifest::new(manifest), result))
    } else {
        Err(result)
    }
}

fn has_duplicate_modification_slots(manifest: &RunManifest) -> bool {
    let mut counts = BTreeMap::<String, usize>::new();
    for modification in &manifest.workflow.selected_modifications {
        counts
            .entry(modification.slot_id.clone())
            .and_modify(|count| *count += 1)
            .or_insert(1);
    }
    counts.values().any(|count| *count > 1)
}

fn issue(code: &str, field: &str, message: &str) -> ManifestPreflightIssue {
    ManifestPreflightIssue {
        code: code.to_string(),
        field: field.to_string(),
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::services::manifest_builder::build_run_manifest;
    use crate::shared::run::{
        ApprovedWorkflowPayload, ExecutionMode, ModificationOptionPayload, ModificationSlotPayload,
        SelectedFile, StartRunRequest, WorkflowParameterChangePayload, WorkflowPayload,
        WorkflowStepPayload,
    };

    use super::{preflight_run_manifest, validate_run_manifest};

    fn established_request() -> StartRunRequest {
        let mut selected_modifications = HashMap::new();
        selected_modifications.insert("slot-a".to_string(), "option-default".to_string());

        StartRunRequest {
            selected_pipeline_id: "bulk-rna-seq-v1".to_string(),
            selected_files: vec![SelectedFile {
                path: "/tmp/in.fastq".to_string(),
                kind: "fastq".to_string(),
            }],
            output_folder: "/tmp".to_string(),
            approved_workflow: ApprovedWorkflowPayload {
                pipeline_id: "bulk-rna-seq-v1".to_string(),
                approved_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
                workflow: WorkflowPayload {
                    steps: vec![WorkflowStepPayload {
                        step_id: "qc".to_string(),
                        display_label: "Quality Control".to_string(),
                        category: "quality-control".to_string(),
                        required: true,
                        added_by_ai: false,
                        modified_by_ai: false,
                        explanation: "QC".to_string(),
                        parameter_change_summary: vec![WorkflowParameterChangePayload {
                            parameter_key: "threshold".to_string(),
                            previous_value: "standard".to_string(),
                            next_value: "strict".to_string(),
                            summary: "increase strictness".to_string(),
                        }],
                        expected_outputs: vec!["qc-report".to_string()],
                    }],
                    modification_slots: vec![ModificationSlotPayload {
                        id: "slot-a".to_string(),
                        label: "Slot A".to_string(),
                        supported_options: vec![ModificationOptionPayload {
                            id: "option-default".to_string(),
                            label: "Default".to_string(),
                            effect_summary: "default".to_string(),
                        }],
                    }],
                },
            },
            selected_modifications,
            execution_mode: ExecutionMode::MockLocal,
        }
    }

    #[test]
    fn established_manifest_passes_preflight() {
        let manifest = build_run_manifest(&established_request());
        let result = preflight_run_manifest(&manifest);
        assert!(result.valid);
    }

    #[test]
    fn ai_assisted_manifest_passes_preflight() {
        let mut request = established_request();
        request.approved_workflow.workflow.steps[0].added_by_ai = true;
        request.approved_workflow.workflow.steps[0].modified_by_ai = true;
        let manifest = build_run_manifest(&request);
        let result = preflight_run_manifest(&manifest);
        assert!(result.valid);
    }

    #[test]
    fn malformed_manifest_fails_preflight() {
        let mut manifest = build_run_manifest(&established_request());
        manifest.workflow.steps[0].step_id = String::new();
        let result = preflight_run_manifest(&manifest);
        assert!(!result.valid);
        assert!(result
            .errors
            .iter()
            .any(|error| error.code == "step-id-missing"));
    }

    #[test]
    fn placeholder_warnings_do_not_block_validation() {
        let manifest = build_run_manifest(&established_request());
        let result = preflight_run_manifest(&manifest);
        assert!(result.valid);
        assert!(!result.warnings.is_empty());
    }

    #[test]
    fn validate_returns_validated_wrapper_on_success() {
        let manifest = build_run_manifest(&established_request());
        let outcome = validate_run_manifest(manifest);
        assert!(outcome.is_ok());
    }
}
