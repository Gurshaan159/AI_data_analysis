use std::collections::BTreeSet;

use crate::shared::manifest::{
    ManifestEnvironmentPlaceholder, ManifestExecutionPlan, ManifestExecutionStage,
    ManifestExpectedArtifact, ManifestInputDescriptor, ManifestModificationDecision,
    ManifestParameterChange, ManifestPipelineMetadata, ManifestProvenance,
    ManifestRuntimePlaceholder, ManifestStepConfiguration, ManifestToolVersionPlaceholder,
    ManifestWorkflow, ManifestWorkflowStep, RunManifest,
};
use crate::shared::run::{ExecutionMode, ModificationSlotPayload, StartRunRequest};

pub fn build_run_manifest(request: &StartRunRequest) -> RunManifest {
    let sorted_inputs = sorted_inputs(request);
    let selected_modifications = selected_modifications(request);
    let steps = workflow_steps(request);
    let expected_artifacts = collect_expected_artifacts(&steps);
    let execution_stages = build_execution_stages(&steps);

    RunManifest {
        manifest_version: "1".to_string(),
        manifest_id: build_manifest_id(request),
        created_at_iso: request.approved_workflow.approved_at_iso.clone(),
        pipeline: ManifestPipelineMetadata {
            pipeline_id: request.selected_pipeline_id.clone(),
            approved_at_iso: request.approved_workflow.approved_at_iso.clone(),
            execution_mode: execution_mode_to_manifest_value(&request.execution_mode),
        },
        inputs: sorted_inputs,
        output: crate::shared::manifest::ManifestOutputLocation {
            directory: request.output_folder.clone(),
            expected_artifacts,
        },
        workflow: ManifestWorkflow {
            steps: steps.clone(),
            selected_modifications: selected_modifications.clone(),
        },
        execution_plan: ManifestExecutionPlan {
            stages: execution_stages,
        },
        provenance: ManifestProvenance {
            source_kind: "validated-run-request".to_string(),
            source_pipeline_id: request.selected_pipeline_id.clone(),
            selected_modification_slots: selected_modifications
                .into_iter()
                .map(|slot| slot.slot_id)
                .collect(),
            input_descriptor_count: request.selected_files.len(),
        },
        environment: ManifestEnvironmentPlaceholder {
            os: None,
            tool_versions: vec![ManifestToolVersionPlaceholder {
                tool_key: "pipeline-runtime".to_string(),
                version: None,
            }],
            environment_hash: None,
        },
        runtime: ManifestRuntimePlaceholder {
            runtime_kind: None,
            container_image: None,
            workflow_engine: None,
        },
    }
}

fn sorted_inputs(request: &StartRunRequest) -> Vec<ManifestInputDescriptor> {
    let mut sorted = request.selected_files.clone();
    sorted.sort_by(|a, b| a.kind.cmp(&b.kind).then_with(|| a.path.cmp(&b.path)));
    sorted
        .into_iter()
        .enumerate()
        .map(|(index, file)| ManifestInputDescriptor {
            input_id: format!("input-{}", index + 1),
            kind: file.kind,
            path: file.path,
        })
        .collect()
}

fn selected_modifications(request: &StartRunRequest) -> Vec<ManifestModificationDecision> {
    let mut sorted_slots: Vec<&ModificationSlotPayload> = request
        .approved_workflow
        .workflow
        .modification_slots
        .iter()
        .collect();
    sorted_slots.sort_by(|a, b| a.id.cmp(&b.id));

    sorted_slots
        .into_iter()
        .map(|slot| {
            let option_id = request
                .selected_modifications
                .get(&slot.id)
                .cloned()
                .unwrap_or_default();
            let selected_option = slot
                .supported_options
                .iter()
                .find(|option| option.id == option_id.as_str())
                .cloned();
            ManifestModificationDecision {
                slot_id: slot.id.clone(),
                slot_label: slot.label.clone(),
                selected_option_id: option_id,
                selected_option_label: selected_option
                    .as_ref()
                    .map(|option| option.label.clone())
                    .unwrap_or_default(),
                effect_summary: selected_option
                    .as_ref()
                    .map(|option| option.effect_summary.clone())
                    .unwrap_or_default(),
            }
        })
        .collect()
}

fn workflow_steps(request: &StartRunRequest) -> Vec<ManifestWorkflowStep> {
    request
        .approved_workflow
        .workflow
        .steps
        .iter()
        .enumerate()
        .map(|(index, step)| ManifestWorkflowStep {
            step_index: index + 1,
            step_id: step.step_id.clone(),
            label: step.display_label.clone(),
            category: step.category.clone(),
            required: step.required,
            explanation: step.explanation.clone(),
            added_by_ai: step.added_by_ai,
            modified_by_ai: step.modified_by_ai,
            expected_artifacts: step
                .expected_outputs
                .iter()
                .map(|output| ManifestExpectedArtifact {
                    artifact_key: output.clone(),
                })
                .collect(),
            configuration: ManifestStepConfiguration {
                parameter_changes: step
                    .parameter_change_summary
                    .iter()
                    .map(|param| ManifestParameterChange {
                        parameter_key: param.parameter_key.clone(),
                        previous_value: param.previous_value.clone(),
                        next_value: param.next_value.clone(),
                        summary: param.summary.clone(),
                    })
                    .collect(),
            },
        })
        .collect()
}

fn collect_expected_artifacts(steps: &[ManifestWorkflowStep]) -> Vec<ManifestExpectedArtifact> {
    let ordered = steps
        .iter()
        .flat_map(|step| {
            step.expected_artifacts
                .iter()
                .map(|artifact| artifact.artifact_key.clone())
        })
        .collect::<BTreeSet<_>>();
    ordered
        .into_iter()
        .map(|artifact_key| ManifestExpectedArtifact { artifact_key })
        .collect()
}

fn build_execution_stages(steps: &[ManifestWorkflowStep]) -> Vec<ManifestExecutionStage> {
    steps
        .iter()
        .map(|step| ManifestExecutionStage {
            stage_id: format!("stage-{}", step.step_id),
            order_index: step.step_index,
            step_id: step.step_id.clone(),
            label: step.label.clone(),
        })
        .collect()
}

fn build_manifest_id(request: &StartRunRequest) -> String {
    let approved = request
        .approved_workflow
        .approved_at_iso
        .replace([':', '.'], "-")
        .replace('T', "_")
        .replace('Z', "");
    format!("manifest-{}-{approved}", request.selected_pipeline_id)
}

fn execution_mode_to_manifest_value(mode: &ExecutionMode) -> String {
    match mode {
        ExecutionMode::MockLocal => "mock-local".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::shared::run::{
        ApprovedWorkflowPayload, ExecutionMode, ModificationOptionPayload, ModificationSlotPayload,
        SelectedFile, StartRunRequest, WorkflowParameterChangePayload, WorkflowPayload,
        WorkflowStepPayload,
    };

    use super::build_run_manifest;

    fn sample_request() -> StartRunRequest {
        let mut selected_modifications = HashMap::new();
        selected_modifications.insert("slot-a".to_string(), "option-default".to_string());

        StartRunRequest {
            selected_pipeline_id: "bulk-rna-seq-v1".to_string(),
            selected_files: vec![
                SelectedFile {
                    path: "/tmp/z.fastq".to_string(),
                    kind: "fastq".to_string(),
                },
                SelectedFile {
                    path: "/tmp/a.metadata.csv".to_string(),
                    kind: "metadata".to_string(),
                },
            ],
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
    fn builds_manifest_with_deterministic_input_order() {
        let manifest = build_run_manifest(&sample_request());
        let ordered_paths = manifest
            .inputs
            .into_iter()
            .map(|input| input.path)
            .collect::<Vec<_>>();
        assert_eq!(
            ordered_paths,
            vec![
                "/tmp/z.fastq".to_string(),
                "/tmp/a.metadata.csv".to_string()
            ]
        );
    }

    #[test]
    fn missing_modification_choice_is_captured_as_empty_value_for_preflight() {
        let mut req = sample_request();
        req.selected_modifications.clear();
        let manifest = build_run_manifest(&req);
        assert_eq!(
            manifest.workflow.selected_modifications[0].selected_option_id,
            ""
        );
    }

    #[test]
    fn preserves_ai_step_flags_and_is_json_stable() {
        let mut req = sample_request();
        req.approved_workflow.workflow.steps[0].added_by_ai = true;
        req.approved_workflow.workflow.steps[0].modified_by_ai = true;

        let manifest_a = build_run_manifest(&req);
        let manifest_b = build_run_manifest(&req);

        assert!(manifest_a.workflow.steps[0].added_by_ai);
        assert!(manifest_a.workflow.steps[0].modified_by_ai);

        let json_a = serde_json::to_string(&manifest_a).expect("manifest_a should serialize");
        let json_b = serde_json::to_string(&manifest_b).expect("manifest_b should serialize");
        assert_eq!(json_a, json_b);
    }
}
