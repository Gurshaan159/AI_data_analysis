use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::services::adapter_step_contract::{
    AdapterStepBinding, PlannedAdapterStep, ScriptedPipelineContract,
};
use crate::services::script_runner::{
    ScriptArgument, ScriptErrorContext, ScriptInvocation, ScriptRunner, ScriptRuntime,
};
use crate::shared::manifest::{
    ManifestExpectedArtifact, ManifestInputDescriptor, ValidatedRunManifest,
};
use crate::shared::run::{build_completed_artifact_records, RunPhase};

#[derive(Debug, Clone)]
pub struct AdapterProgressEvent {
    pub phase: RunPhase,
    pub message: String,
    pub step_id: Option<String>,
    pub step_label: Option<String>,
    pub progress_index: usize,
    pub total_progress: usize,
}

#[derive(Debug, Clone)]
pub struct AdapterRunResult {
    pub completed: bool,
    pub cancelled: bool,
}

#[derive(Clone)]
pub struct AdapterExecutionContext {
    pub run_id: String,
    pub cancellation: Arc<AtomicBool>,
    pub emit: Arc<dyn Fn(AdapterProgressEvent) + Send + Sync>,
}

pub trait ExecutionAdapter: Send + Sync {
    fn adapter_id(&self) -> &'static str;
    fn execute(
        &self,
        manifest: &ValidatedRunManifest,
        context: AdapterExecutionContext,
    ) -> Result<AdapterRunResult, AppError>;
}

pub struct PlaceholderLocalExecutionAdapter;
pub struct CountMatrixLocalExecutionAdapter;
pub struct BulkRnaMatrixLocalExecutionAdapter;

const COUNT_MATRIX_STEPS: &[AdapterStepBinding] = &[
    AdapterStepBinding {
        manifest_step_id: "matrix-validate",
        action_id: "validate",
        progress_label: "Matrix and Metadata Validation",
    },
    AdapterStepBinding {
        manifest_step_id: "matrix-normalize",
        action_id: "normalize",
        progress_label: "Count Normalization",
    },
    AdapterStepBinding {
        manifest_step_id: "matrix-model",
        action_id: "model",
        progress_label: "Differential Modeling",
    },
];

const BULK_RNA_MATRIX_STEPS: &[AdapterStepBinding] = &[
    AdapterStepBinding {
        manifest_step_id: "bulk-matrix-validate",
        action_id: "validate",
        progress_label: "Bulk Matrix and Metadata Validation",
    },
    AdapterStepBinding {
        manifest_step_id: "bulk-matrix-normalize",
        action_id: "normalize",
        progress_label: "Bulk RNA Normalization and PCA",
    },
    AdapterStepBinding {
        manifest_step_id: "bulk-matrix-model",
        action_id: "differential",
        progress_label: "Bulk RNA Differential Expression",
    },
];

const COUNT_MATRIX_CONTRACT: ScriptedPipelineContract = ScriptedPipelineContract {
    pipeline_id: "count-matrix-analysis-v1",
    runtime: ScriptRuntime::Python3,
    script_relative_path: "scripts/count_matrix_analysis.py",
    steps: COUNT_MATRIX_STEPS,
};

const BULK_RNA_MATRIX_CONTRACT: ScriptedPipelineContract = ScriptedPipelineContract {
    pipeline_id: "bulk-rna-matrix-downstream-v1",
    runtime: ScriptRuntime::Python3,
    script_relative_path: "scripts/bulk_rna_matrix_analysis.py",
    steps: BULK_RNA_MATRIX_STEPS,
};

pub fn adapter_for_pipeline(pipeline_id: &str) -> Box<dyn ExecutionAdapter> {
    if pipeline_id == "count-matrix-analysis-v1" {
        return Box::new(CountMatrixLocalExecutionAdapter);
    }
    if pipeline_id == "bulk-rna-matrix-downstream-v1" {
        return Box::new(BulkRnaMatrixLocalExecutionAdapter);
    }
    Box::new(PlaceholderLocalExecutionAdapter)
}

impl PlaceholderLocalExecutionAdapter {
    fn should_cancel(flag: &AtomicBool) -> bool {
        flag.load(Ordering::SeqCst)
    }

    fn emit_cancelled(
        context: &AdapterExecutionContext,
        progress_index: usize,
        total_progress: usize,
    ) -> AdapterRunResult {
        (context.emit)(AdapterProgressEvent {
            phase: RunPhase::Cancelled,
            message: "Run cancelled by user.".to_string(),
            step_id: None,
            step_label: None,
            progress_index,
            total_progress,
        });
        AdapterRunResult {
            completed: false,
            cancelled: true,
        }
    }
}

impl ExecutionAdapter for PlaceholderLocalExecutionAdapter {
    fn adapter_id(&self) -> &'static str {
        "placeholder-local-v1"
    }

    fn execute(
        &self,
        validated_manifest: &ValidatedRunManifest,
        context: AdapterExecutionContext,
    ) -> Result<AdapterRunResult, AppError> {
        let manifest = validated_manifest.manifest();
        let total_progress = manifest.execution_plan.stages.len() + 5;
        let mut progress_index = 1usize;

        (context.emit)(AdapterProgressEvent {
            phase: RunPhase::Queued,
            message: "Run accepted and queued.".to_string(),
            step_id: None,
            step_label: None,
            progress_index,
            total_progress,
        });
        thread::sleep(Duration::from_millis(250));
        if Self::should_cancel(context.cancellation.as_ref()) {
            return Ok(Self::emit_cancelled(
                &context,
                progress_index,
                total_progress,
            ));
        }

        progress_index += 1;
        (context.emit)(AdapterProgressEvent {
            phase: RunPhase::Validating,
            message: "Validating run manifest and execution inputs.".to_string(),
            step_id: None,
            step_label: None,
            progress_index,
            total_progress,
        });
        thread::sleep(Duration::from_millis(350));
        if Self::should_cancel(context.cancellation.as_ref()) {
            return Ok(Self::emit_cancelled(
                &context,
                progress_index,
                total_progress,
            ));
        }

        progress_index += 1;
        (context.emit)(AdapterProgressEvent {
            phase: RunPhase::Preparing,
            message: "Preparing placeholder local execution session.".to_string(),
            step_id: None,
            step_label: None,
            progress_index,
            total_progress,
        });
        let run_output_dir = PathBuf::from(&manifest.output.directory).join(&context.run_id);
        fs::create_dir_all(&run_output_dir).map_err(|error| {
            AppError::CommandExecution(format!(
                "failed to create run output directory '{}': {error}",
                run_output_dir.display()
            ))
        })?;

        let manifest_target = run_output_dir.join("run-manifest.json");
        let manifest_json = serde_json::to_string_pretty(manifest).map_err(|error| {
            AppError::CommandExecution(format!("failed to serialize run manifest: {error}"))
        })?;
        fs::write(&manifest_target, manifest_json).map_err(|error| {
            AppError::CommandExecution(format!(
                "failed to write run manifest to '{}': {error}",
                manifest_target.display()
            ))
        })?;

        thread::sleep(Duration::from_millis(350));
        if Self::should_cancel(context.cancellation.as_ref()) {
            return Ok(Self::emit_cancelled(
                &context,
                progress_index,
                total_progress,
            ));
        }

        for stage in &manifest.execution_plan.stages {
            progress_index += 1;
            (context.emit)(AdapterProgressEvent {
                phase: RunPhase::RunningStep,
                message: format!("Running placeholder step: {}", stage.label),
                step_id: Some(stage.step_id.clone()),
                step_label: Some(stage.label.clone()),
                progress_index,
                total_progress,
            });
            thread::sleep(Duration::from_millis(500));
            if Self::should_cancel(context.cancellation.as_ref()) {
                return Ok(Self::emit_cancelled(
                    &context,
                    progress_index,
                    total_progress,
                ));
            }
        }

        progress_index += 1;
        (context.emit)(AdapterProgressEvent {
            phase: RunPhase::Finalizing,
            message: "Finalizing run artifacts and provenance snapshot.".to_string(),
            step_id: None,
            step_label: None,
            progress_index,
            total_progress,
        });

        let provenance_path = run_output_dir.join("run-provenance.json");
        let provenance_json = serde_json::to_string_pretty(&serde_json::json!({
            "runId": context.run_id,
            "pipelineId": manifest.pipeline.pipeline_id,
            "manifestVersion": manifest.manifest_version,
            "manifestId": manifest.manifest_id,
            "manifestCreatedAtIso": manifest.created_at_iso,
            "startedAtEpochMs": SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or_default(),
            "steps": manifest.workflow.steps.iter().map(|step| serde_json::json!({
                "stepId": step.step_id,
                "label": step.label,
                "required": step.required
            })).collect::<Vec<_>>(),
            "selectedModifications": manifest.workflow.selected_modifications,
            "inputs": manifest.inputs,
            "outputDirectory": manifest.output.directory,
            "environment": manifest.environment
        }))
        .map_err(|error| AppError::CommandExecution(format!("failed to serialize run provenance: {error}")))?;
        fs::write(&provenance_path, provenance_json).map_err(|error| {
            AppError::CommandExecution(format!(
                "failed to write provenance snapshot to '{}': {error}",
                provenance_path.display()
            ))
        })?;

        for ManifestExpectedArtifact { artifact_key } in &manifest.output.expected_artifacts {
            let artifact_file = run_output_dir.join(format!("{artifact_key}.placeholder.txt"));
            fs::write(
                artifact_file,
                format!(
                    "Placeholder artifact for '{artifact_key}' generated by adapter '{}'.\n",
                    self.adapter_id()
                ),
            )
            .map_err(|error| {
                AppError::CommandExecution(format!("failed to write placeholder artifact: {error}"))
            })?;
        }

        thread::sleep(Duration::from_millis(350));
        if Self::should_cancel(context.cancellation.as_ref()) {
            return Ok(Self::emit_cancelled(
                &context,
                progress_index,
                total_progress,
            ));
        }

        progress_index += 1;
        (context.emit)(AdapterProgressEvent {
            phase: RunPhase::Completed,
            message: format!(
                "Placeholder execution finished. Manifest and artifacts written to '{}'.",
                run_output_dir.display()
            ),
            step_id: None,
            step_label: None,
            progress_index,
            total_progress,
        });

        Ok(AdapterRunResult {
            completed: true,
            cancelled: false,
        })
    }
}

impl ExecutionAdapter for CountMatrixLocalExecutionAdapter {
    fn adapter_id(&self) -> &'static str {
        "count-matrix-local-v1"
    }

    fn execute(
        &self,
        validated_manifest: &ValidatedRunManifest,
        context: AdapterExecutionContext,
    ) -> Result<AdapterRunResult, AppError> {
        let manifest = validated_manifest.manifest();
        let matrix_input = required_input_by_kind(manifest, "matrix", "count-matrix-analysis-v1")?;
        let metadata_input =
            required_input_by_kind(manifest, "metadata", "count-matrix-analysis-v1")?;

        run_scripted_pipeline(
            validated_manifest,
            context,
            COUNT_MATRIX_CONTRACT,
            "Validating count-matrix manifest inputs.",
            "Preparing count-matrix local execution session.",
            "Finalizing count-matrix analysis outputs.",
            "Count-matrix analysis completed with outputs in",
            |step, run_output_dir| match step.action_id.as_str() {
                "validate" | "normalize" => Ok(vec![
                    ScriptArgument::new("--matrix", matrix_input.path.clone()),
                    ScriptArgument::new("--metadata", metadata_input.path.clone()),
                ]),
                "model" => Ok(vec![
                    ScriptArgument::new(
                        "--normalized-matrix",
                        run_output_dir
                            .join("normalized_matrix.tsv")
                            .to_string_lossy()
                            .to_string(),
                    ),
                    ScriptArgument::new("--metadata", metadata_input.path.clone()),
                ]),
                unknown => Err(AppError::Config(format!(
                    "unsupported action '{unknown}' in count-matrix contract"
                ))),
            },
        )
    }
}

impl ExecutionAdapter for BulkRnaMatrixLocalExecutionAdapter {
    fn adapter_id(&self) -> &'static str {
        "bulk-rna-matrix-local-v1"
    }

    fn execute(
        &self,
        validated_manifest: &ValidatedRunManifest,
        context: AdapterExecutionContext,
    ) -> Result<AdapterRunResult, AppError> {
        let manifest = validated_manifest.manifest();
        let matrix_input =
            required_input_by_kind(manifest, "matrix", "bulk-rna-matrix-downstream-v1")?;
        let metadata_input =
            required_input_by_kind(manifest, "metadata", "bulk-rna-matrix-downstream-v1")?;

        run_scripted_pipeline(
            validated_manifest,
            context,
            BULK_RNA_MATRIX_CONTRACT,
            "Validating bulk RNA matrix-manifest inputs.",
            "Preparing bulk RNA matrix-based local execution session.",
            "Finalizing bulk RNA matrix-based analysis outputs.",
            "Bulk RNA matrix-based analysis completed with outputs in",
            |step, run_output_dir| match step.action_id.as_str() {
                "validate" | "normalize" => Ok(vec![
                    ScriptArgument::new("--matrix", matrix_input.path.clone()),
                    ScriptArgument::new("--metadata", metadata_input.path.clone()),
                ]),
                "differential" => Ok(vec![
                    ScriptArgument::new(
                        "--normalized-matrix",
                        run_output_dir
                            .join("normalized_matrix.tsv")
                            .to_string_lossy()
                            .to_string(),
                    ),
                    ScriptArgument::new("--metadata", metadata_input.path.clone()),
                ]),
                unknown => Err(AppError::Config(format!(
                    "unsupported action '{unknown}' in bulk-rna matrix contract"
                ))),
            },
        )
    }
}

fn required_input_by_kind<'a>(
    manifest: &'a crate::shared::manifest::RunManifest,
    kind: &str,
    pipeline_id: &str,
) -> Result<&'a ManifestInputDescriptor, AppError> {
    let matches = manifest
        .inputs
        .iter()
        .filter(|input| input.kind == kind)
        .collect::<Vec<_>>();

    match matches.as_slice() {
        [only] => Ok(*only),
        [] => Err(AppError::CommandExecution(format!(
            "{pipeline_id} pipeline requires one '{kind}' input, found 0"
        ))),
        many => {
            let ids = many
                .iter()
                .map(|input| input.input_id.clone())
                .collect::<Vec<_>>()
                .join(", ");
            Err(AppError::CommandExecution(format!(
                "{pipeline_id} pipeline requires exactly one '{kind}' input, found {} (inputIds: {ids})",
                many.len()
            )))
        }
    }
}

fn run_scripted_pipeline<F>(
    validated_manifest: &ValidatedRunManifest,
    context: AdapterExecutionContext,
    contract: ScriptedPipelineContract,
    validating_message: &str,
    preparing_message: &str,
    finalizing_message: &str,
    completed_message_prefix: &str,
    mut build_step_args: F,
) -> Result<AdapterRunResult, AppError>
where
    F: FnMut(&PlannedAdapterStep, &PathBuf) -> Result<Vec<ScriptArgument>, AppError>,
{
    let manifest = validated_manifest.manifest();
    let planned_steps = contract.plan_steps(manifest)?;
    let total_progress = planned_steps.len() + 5;
    let mut progress_index = 1usize;

    (context.emit)(AdapterProgressEvent {
        phase: RunPhase::Queued,
        message: "Run accepted and queued.".to_string(),
        step_id: None,
        step_label: None,
        progress_index,
        total_progress,
    });
    if PlaceholderLocalExecutionAdapter::should_cancel(context.cancellation.as_ref()) {
        return Ok(PlaceholderLocalExecutionAdapter::emit_cancelled(
            &context,
            progress_index,
            total_progress,
        ));
    }

    progress_index += 1;
    (context.emit)(AdapterProgressEvent {
        phase: RunPhase::Validating,
        message: validating_message.to_string(),
        step_id: None,
        step_label: None,
        progress_index,
        total_progress,
    });
    if PlaceholderLocalExecutionAdapter::should_cancel(context.cancellation.as_ref()) {
        return Ok(PlaceholderLocalExecutionAdapter::emit_cancelled(
            &context,
            progress_index,
            total_progress,
        ));
    }

    progress_index += 1;
    (context.emit)(AdapterProgressEvent {
        phase: RunPhase::Preparing,
        message: preparing_message.to_string(),
        step_id: None,
        step_label: None,
        progress_index,
        total_progress,
    });
    let run_output_dir = PathBuf::from(&manifest.output.directory).join(&context.run_id);
    fs::create_dir_all(&run_output_dir).map_err(|error| {
        AppError::CommandExecution(format!(
            "failed to create run output directory '{}': {error}",
            run_output_dir.display()
        ))
    })?;
    let manifest_target = run_output_dir.join("run-manifest.json");
    let manifest_json = serde_json::to_string_pretty(manifest).map_err(|error| {
        AppError::CommandExecution(format!("failed to serialize run manifest: {error}"))
    })?;
    fs::write(&manifest_target, manifest_json).map_err(|error| {
        AppError::CommandExecution(format!(
            "failed to write run manifest to '{}': {error}",
            manifest_target.display()
        ))
    })?;
    if PlaceholderLocalExecutionAdapter::should_cancel(context.cancellation.as_ref()) {
        return Ok(PlaceholderLocalExecutionAdapter::emit_cancelled(
            &context,
            progress_index,
            total_progress,
        ));
    }

    let script_runner = ScriptRunner::default();
    let script_path = contract.script_path();
    let mut produced_files: Vec<PathBuf> = vec![manifest_target];

    for planned in &planned_steps {
        progress_index += 1;
        (context.emit)(AdapterProgressEvent {
            phase: RunPhase::RunningStep,
            message: format!("Running step: {}", planned.progress_label),
            step_id: Some(planned.manifest_step_id.clone()),
            step_label: Some(planned.progress_label.clone()),
            progress_index,
            total_progress,
        });

        let args = build_step_args(planned, &run_output_dir)?;
        let script_result = script_runner.run(
            &ScriptInvocation {
                runtime: contract.runtime,
                script_path: script_path.clone(),
                action: planned.action_id.clone(),
                output_dir: run_output_dir.clone(),
                args,
            },
            &ScriptErrorContext {
                pipeline_id: manifest.pipeline.pipeline_id.clone(),
                step_id: planned.manifest_step_id.clone(),
                action_id: planned.action_id.clone(),
            },
        )?;
        let _ = (&script_result.stdout, &script_result.stderr);
        produced_files.extend(script_result.outputs);

        if PlaceholderLocalExecutionAdapter::should_cancel(context.cancellation.as_ref()) {
            return Ok(PlaceholderLocalExecutionAdapter::emit_cancelled(
                &context,
                progress_index,
                total_progress,
            ));
        }
    }

    progress_index += 1;
    (context.emit)(AdapterProgressEvent {
        phase: RunPhase::Finalizing,
        message: finalizing_message.to_string(),
        step_id: None,
        step_label: None,
        progress_index,
        total_progress,
    });
    write_provenance(manifest, &context.run_id, &run_output_dir, produced_files)?;
    if PlaceholderLocalExecutionAdapter::should_cancel(context.cancellation.as_ref()) {
        return Ok(PlaceholderLocalExecutionAdapter::emit_cancelled(
            &context,
            progress_index,
            total_progress,
        ));
    }

    progress_index += 1;
    (context.emit)(AdapterProgressEvent {
        phase: RunPhase::Completed,
        message: format!("{completed_message_prefix} '{}'.", run_output_dir.display()),
        step_id: None,
        step_label: None,
        progress_index,
        total_progress,
    });
    Ok(AdapterRunResult {
        completed: true,
        cancelled: false,
    })
}

fn write_provenance(
    manifest: &crate::shared::manifest::RunManifest,
    run_id: &str,
    run_output_dir: &PathBuf,
    produced_files: Vec<PathBuf>,
) -> Result<(), AppError> {
    let artifacts = build_completed_artifact_records(run_output_dir, &produced_files).map_err(
        |error| {
            AppError::CommandExecution(format!(
                "failed to build structured artifact records for provenance: {error}"
            ))
        },
    )?;
    let provenance_path = run_output_dir.join("run-provenance.json");
    let provenance_json = serde_json::to_string_pretty(&serde_json::json!({
        "runId": run_id,
        "pipelineId": manifest.pipeline.pipeline_id,
        "manifestVersion": manifest.manifest_version,
        "manifestId": manifest.manifest_id,
        "manifestCreatedAtIso": manifest.created_at_iso,
        "steps": manifest.workflow.steps.iter().map(|step| serde_json::json!({
            "stepId": step.step_id,
            "label": step.label
        })).collect::<Vec<_>>(),
        "outputDirectory": manifest.output.directory,
        "producedFiles": produced_files.iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>(),
        "artifacts": artifacts,
        "environment": manifest.environment
    }))
    .map_err(|error| AppError::CommandExecution(format!("failed to serialize run provenance: {error}")))?;
    fs::write(&provenance_path, provenance_json).map_err(|error| {
        AppError::CommandExecution(format!(
            "failed to write provenance snapshot to '{}': {error}",
            provenance_path.display()
        ))
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::services::manifest_preflight;
    use crate::shared::manifest::{
        ManifestEnvironmentPlaceholder, ManifestExecutionPlan, ManifestExecutionStage,
        ManifestExpectedArtifact, ManifestInputDescriptor, ManifestModificationDecision,
        ManifestOutputLocation, ManifestPipelineMetadata, ManifestProvenance,
        ManifestRuntimePlaceholder, ManifestStepConfiguration, ManifestWorkflow,
        ManifestWorkflowStep, RunManifest,
    };

    use super::{
        AdapterExecutionContext, AdapterProgressEvent, BulkRnaMatrixLocalExecutionAdapter,
        CountMatrixLocalExecutionAdapter, ExecutionAdapter, PlaceholderLocalExecutionAdapter,
        BULK_RNA_MATRIX_CONTRACT, COUNT_MATRIX_CONTRACT,
    };

    fn sample_manifest(output_dir: &str) -> RunManifest {
        RunManifest {
            manifest_version: "1".to_string(),
            manifest_id: "manifest-test".to_string(),
            created_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
            pipeline: ManifestPipelineMetadata {
                pipeline_id: "bulk-rna-seq-v1".to_string(),
                approved_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
                execution_mode: "mock-local".to_string(),
            },
            inputs: vec![ManifestInputDescriptor {
                input_id: "input-1".to_string(),
                kind: "fastq".to_string(),
                path: "/tmp/in.fastq".to_string(),
            }],
            output: ManifestOutputLocation {
                directory: output_dir.to_string(),
                expected_artifacts: vec![ManifestExpectedArtifact {
                    artifact_key: "qc-report".to_string(),
                }],
            },
            workflow: ManifestWorkflow {
                steps: vec![
                    ManifestWorkflowStep {
                        step_index: 1,
                        step_id: "step-a".to_string(),
                        label: "Step A".to_string(),
                        category: "quality-control".to_string(),
                        required: true,
                        explanation: "Step A".to_string(),
                        added_by_ai: false,
                        modified_by_ai: false,
                        expected_artifacts: vec![ManifestExpectedArtifact {
                            artifact_key: "qc-report".to_string(),
                        }],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                    ManifestWorkflowStep {
                        step_index: 2,
                        step_id: "step-b".to_string(),
                        label: "Step B".to_string(),
                        category: "alignment".to_string(),
                        required: true,
                        explanation: "Step B".to_string(),
                        added_by_ai: true,
                        modified_by_ai: true,
                        expected_artifacts: vec![ManifestExpectedArtifact {
                            artifact_key: "qc-report".to_string(),
                        }],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                ],
                selected_modifications: vec![ManifestModificationDecision {
                    slot_id: "slot-a".to_string(),
                    slot_label: "Slot A".to_string(),
                    selected_option_id: "default".to_string(),
                    selected_option_label: "Default".to_string(),
                    effect_summary: "default".to_string(),
                }],
            },
            execution_plan: ManifestExecutionPlan {
                stages: vec![
                    ManifestExecutionStage {
                        stage_id: "stage-step-a".to_string(),
                        order_index: 1,
                        step_id: "step-a".to_string(),
                        label: "Step A".to_string(),
                    },
                    ManifestExecutionStage {
                        stage_id: "stage-step-b".to_string(),
                        order_index: 2,
                        step_id: "step-b".to_string(),
                        label: "Step B".to_string(),
                    },
                ],
            },
            provenance: ManifestProvenance {
                source_kind: "validated-run-request".to_string(),
                source_pipeline_id: "bulk-rna-seq-v1".to_string(),
                selected_modification_slots: vec!["slot-a".to_string()],
                input_descriptor_count: 1,
            },
            environment: ManifestEnvironmentPlaceholder {
                os: None,
                tool_versions: vec![],
                environment_hash: None,
            },
            runtime: ManifestRuntimePlaceholder {
                runtime_kind: None,
                container_image: None,
                workflow_engine: None,
            },
        }
    }

    fn temp_dir() -> String {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("bio-run-adapter-test-{stamp}"));
        fs::create_dir_all(&path).expect("temp directory should be creatable");
        path.to_string_lossy().to_string()
    }

    fn python_available() -> bool {
        Command::new("python3")
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    fn write_text(path: &PathBuf, content: &str) {
        fs::write(path, content).expect("test fixture write should succeed");
    }

    fn count_matrix_manifest(base: &str, matrix_path: &str, metadata_path: &str) -> RunManifest {
        RunManifest {
            manifest_version: "1".to_string(),
            manifest_id: "manifest-count-matrix".to_string(),
            created_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
            pipeline: ManifestPipelineMetadata {
                pipeline_id: "count-matrix-analysis-v1".to_string(),
                approved_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
                execution_mode: "mock-local".to_string(),
            },
            inputs: vec![
                ManifestInputDescriptor {
                    input_id: "input-1".to_string(),
                    kind: "matrix".to_string(),
                    path: matrix_path.to_string(),
                },
                ManifestInputDescriptor {
                    input_id: "input-2".to_string(),
                    kind: "metadata".to_string(),
                    path: metadata_path.to_string(),
                },
            ],
            output: ManifestOutputLocation {
                directory: base.to_string(),
                expected_artifacts: vec![
                    ManifestExpectedArtifact {
                        artifact_key: "normalized-count-matrix".to_string(),
                    },
                    ManifestExpectedArtifact {
                        artifact_key: "differential-expression-table".to_string(),
                    },
                    ManifestExpectedArtifact {
                        artifact_key: "summary-report".to_string(),
                    },
                ],
            },
            workflow: ManifestWorkflow {
                steps: vec![
                    ManifestWorkflowStep {
                        step_index: 1,
                        step_id: "matrix-validate".to_string(),
                        label: "Matrix and Metadata Validation".to_string(),
                        category: "preprocessing".to_string(),
                        required: true,
                        explanation: "validate matrix and metadata".to_string(),
                        added_by_ai: false,
                        modified_by_ai: false,
                        expected_artifacts: vec![ManifestExpectedArtifact {
                            artifact_key: "summary-report".to_string(),
                        }],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                    ManifestWorkflowStep {
                        step_index: 2,
                        step_id: "matrix-normalize".to_string(),
                        label: "Count Normalization".to_string(),
                        category: "normalization".to_string(),
                        required: true,
                        explanation: "normalize".to_string(),
                        added_by_ai: false,
                        modified_by_ai: false,
                        expected_artifacts: vec![ManifestExpectedArtifact {
                            artifact_key: "normalized-count-matrix".to_string(),
                        }],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                    ManifestWorkflowStep {
                        step_index: 3,
                        step_id: "matrix-model".to_string(),
                        label: "Differential Modeling".to_string(),
                        category: "statistical-analysis".to_string(),
                        required: true,
                        explanation: "model".to_string(),
                        added_by_ai: false,
                        modified_by_ai: false,
                        expected_artifacts: vec![
                            ManifestExpectedArtifact {
                                artifact_key: "differential-expression-table".to_string(),
                            },
                            ManifestExpectedArtifact {
                                artifact_key: "summary-report".to_string(),
                            },
                        ],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                ],
                selected_modifications: vec![ManifestModificationDecision {
                    slot_id: "slot-a".to_string(),
                    slot_label: "Slot A".to_string(),
                    selected_option_id: "default".to_string(),
                    selected_option_label: "Default".to_string(),
                    effect_summary: "default".to_string(),
                }],
            },
            execution_plan: ManifestExecutionPlan {
                stages: vec![
                    ManifestExecutionStage {
                        stage_id: "stage-matrix-validate".to_string(),
                        order_index: 1,
                        step_id: "matrix-validate".to_string(),
                        label: "Matrix and Metadata Validation".to_string(),
                    },
                    ManifestExecutionStage {
                        stage_id: "stage-matrix-normalize".to_string(),
                        order_index: 2,
                        step_id: "matrix-normalize".to_string(),
                        label: "Count Normalization".to_string(),
                    },
                    ManifestExecutionStage {
                        stage_id: "stage-matrix-model".to_string(),
                        order_index: 3,
                        step_id: "matrix-model".to_string(),
                        label: "Differential Modeling".to_string(),
                    },
                ],
            },
            provenance: ManifestProvenance {
                source_kind: "validated-run-request".to_string(),
                source_pipeline_id: "count-matrix-analysis-v1".to_string(),
                selected_modification_slots: vec!["slot-a".to_string()],
                input_descriptor_count: 2,
            },
            environment: ManifestEnvironmentPlaceholder {
                os: None,
                tool_versions: vec![],
                environment_hash: None,
            },
            runtime: ManifestRuntimePlaceholder {
                runtime_kind: None,
                container_image: None,
                workflow_engine: None,
            },
        }
    }

    fn bulk_rna_matrix_manifest(base: &str, matrix_path: &str, metadata_path: &str) -> RunManifest {
        RunManifest {
            manifest_version: "1".to_string(),
            manifest_id: "manifest-bulk-rna-matrix".to_string(),
            created_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
            pipeline: ManifestPipelineMetadata {
                pipeline_id: "bulk-rna-matrix-downstream-v1".to_string(),
                approved_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
                execution_mode: "mock-local".to_string(),
            },
            inputs: vec![
                ManifestInputDescriptor {
                    input_id: "input-1".to_string(),
                    kind: "matrix".to_string(),
                    path: matrix_path.to_string(),
                },
                ManifestInputDescriptor {
                    input_id: "input-2".to_string(),
                    kind: "metadata".to_string(),
                    path: metadata_path.to_string(),
                },
            ],
            output: ManifestOutputLocation {
                directory: base.to_string(),
                expected_artifacts: vec![
                    ManifestExpectedArtifact {
                        artifact_key: "normalized-count-matrix".to_string(),
                    },
                    ManifestExpectedArtifact {
                        artifact_key: "differential-expression-table".to_string(),
                    },
                    ManifestExpectedArtifact {
                        artifact_key: "summary-report".to_string(),
                    },
                    ManifestExpectedArtifact {
                        artifact_key: "volcano-plot".to_string(),
                    },
                ],
            },
            workflow: ManifestWorkflow {
                steps: vec![
                    ManifestWorkflowStep {
                        step_index: 1,
                        step_id: "bulk-matrix-validate".to_string(),
                        label: "Bulk Matrix and Metadata Validation".to_string(),
                        category: "preprocessing".to_string(),
                        required: true,
                        explanation: "validate matrix and metadata".to_string(),
                        added_by_ai: false,
                        modified_by_ai: false,
                        expected_artifacts: vec![ManifestExpectedArtifact {
                            artifact_key: "summary-report".to_string(),
                        }],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                    ManifestWorkflowStep {
                        step_index: 2,
                        step_id: "bulk-matrix-normalize".to_string(),
                        label: "Bulk RNA Normalization and PCA".to_string(),
                        category: "normalization".to_string(),
                        required: true,
                        explanation: "normalize and pca".to_string(),
                        added_by_ai: false,
                        modified_by_ai: false,
                        expected_artifacts: vec![
                            ManifestExpectedArtifact {
                                artifact_key: "normalized-count-matrix".to_string(),
                            },
                            ManifestExpectedArtifact {
                                artifact_key: "summary-report".to_string(),
                            },
                        ],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                    ManifestWorkflowStep {
                        step_index: 3,
                        step_id: "bulk-matrix-model".to_string(),
                        label: "Bulk RNA Differential Expression".to_string(),
                        category: "statistical-analysis".to_string(),
                        required: true,
                        explanation: "differential expression and volcano".to_string(),
                        added_by_ai: false,
                        modified_by_ai: false,
                        expected_artifacts: vec![
                            ManifestExpectedArtifact {
                                artifact_key: "differential-expression-table".to_string(),
                            },
                            ManifestExpectedArtifact {
                                artifact_key: "volcano-plot".to_string(),
                            },
                            ManifestExpectedArtifact {
                                artifact_key: "summary-report".to_string(),
                            },
                        ],
                        configuration: ManifestStepConfiguration {
                            parameter_changes: vec![],
                        },
                    },
                ],
                selected_modifications: vec![],
            },
            execution_plan: ManifestExecutionPlan {
                stages: vec![
                    ManifestExecutionStage {
                        stage_id: "stage-bulk-matrix-validate".to_string(),
                        order_index: 1,
                        step_id: "bulk-matrix-validate".to_string(),
                        label: "Bulk Matrix and Metadata Validation".to_string(),
                    },
                    ManifestExecutionStage {
                        stage_id: "stage-bulk-matrix-normalize".to_string(),
                        order_index: 2,
                        step_id: "bulk-matrix-normalize".to_string(),
                        label: "Bulk RNA Normalization and PCA".to_string(),
                    },
                    ManifestExecutionStage {
                        stage_id: "stage-bulk-matrix-model".to_string(),
                        order_index: 3,
                        step_id: "bulk-matrix-model".to_string(),
                        label: "Bulk RNA Differential Expression".to_string(),
                    },
                ],
            },
            provenance: ManifestProvenance {
                source_kind: "validated-run-request".to_string(),
                source_pipeline_id: "bulk-rna-matrix-downstream-v1".to_string(),
                selected_modification_slots: vec![],
                input_descriptor_count: 2,
            },
            environment: ManifestEnvironmentPlaceholder {
                os: None,
                tool_versions: vec![],
                environment_hash: None,
            },
            runtime: ManifestRuntimePlaceholder {
                runtime_kind: None,
                container_image: None,
                workflow_engine: None,
            },
        }
    }

    #[test]
    fn emits_step_progress_and_writes_manifest() {
        let base = temp_dir();
        let manifest = sample_manifest(&base);
        let events = Arc::new(Mutex::new(Vec::<AdapterProgressEvent>::new()));
        let events_capture = events.clone();
        let run_id = "run-test-1".to_string();

        let adapter = PlaceholderLocalExecutionAdapter;
        let validated_manifest = manifest_preflight::validate_run_manifest(manifest)
            .expect("manifest should pass preflight")
            .0;
        let result = adapter
            .execute(
                &validated_manifest,
                AdapterExecutionContext {
                    run_id: run_id.clone(),
                    cancellation: Arc::new(AtomicBool::new(false)),
                    emit: Arc::new(move |event| {
                        events_capture
                            .lock()
                            .expect("events lock should succeed")
                            .push(event);
                    }),
                },
            )
            .expect("adapter execution should succeed");

        assert!(result.completed);

        let locked = events.lock().expect("events lock should succeed");
        let running_step_events = locked
            .iter()
            .filter(|event| matches!(event.phase, crate::shared::run::RunPhase::RunningStep))
            .count();
        assert_eq!(running_step_events, 2);

        let manifest_path = PathBuf::from(&base).join(run_id).join("run-manifest.json");
        assert!(manifest_path.exists());
    }

    #[test]
    fn stops_cleanly_when_cancelled() {
        let base = temp_dir();
        let manifest = sample_manifest(&base);
        let events = Arc::new(Mutex::new(Vec::<AdapterProgressEvent>::new()));
        let events_capture = events.clone();
        let cancellation = Arc::new(AtomicBool::new(true));

        let adapter = PlaceholderLocalExecutionAdapter;
        let validated_manifest = manifest_preflight::validate_run_manifest(manifest)
            .expect("manifest should pass preflight")
            .0;
        let result = adapter
            .execute(
                &validated_manifest,
                AdapterExecutionContext {
                    run_id: "run-test-cancel".to_string(),
                    cancellation,
                    emit: Arc::new(move |event| {
                        events_capture
                            .lock()
                            .expect("events lock should succeed")
                            .push(event);
                    }),
                },
            )
            .expect("adapter should report cancellation cleanly");

        assert!(result.cancelled);
        let locked = events.lock().expect("events lock should succeed");
        assert!(locked
            .iter()
            .any(|event| matches!(event.phase, crate::shared::run::RunPhase::Cancelled)));
    }

    #[test]
    fn count_matrix_adapter_produces_real_outputs_and_step_events() {
        if !python_available() {
            return;
        }
        let base = temp_dir();
        let matrix_path = PathBuf::from(&base).join("matrix.tsv");
        let metadata_path = PathBuf::from(&base).join("metadata.tsv");
        write_text(
            &matrix_path,
            "gene_id\ts1\ts2\ts3\nG1\t10\t15\t20\nG2\t5\t4\t8\nG3\t20\t30\t25\n",
        );
        write_text(
            &metadata_path,
            "sample_id\tcondition\ns1\tcontrol\ns2\ttreated\ns3\ttreated\n",
        );
        let manifest = count_matrix_manifest(
            &base,
            matrix_path.to_string_lossy().as_ref(),
            metadata_path.to_string_lossy().as_ref(),
        );
        let validated = manifest_preflight::validate_run_manifest(manifest)
            .expect("manifest should pass preflight")
            .0;

        let events = Arc::new(Mutex::new(Vec::<AdapterProgressEvent>::new()));
        let events_capture = events.clone();
        let run_id = "run-count-matrix".to_string();
        let adapter = CountMatrixLocalExecutionAdapter;
        let result = adapter
            .execute(
                &validated,
                AdapterExecutionContext {
                    run_id: run_id.clone(),
                    cancellation: Arc::new(AtomicBool::new(false)),
                    emit: Arc::new(move |event| {
                        events_capture
                            .lock()
                            .expect("events lock should succeed")
                            .push(event);
                    }),
                },
            )
            .expect("count matrix adapter execution should succeed");
        assert!(result.completed);

        let run_dir = PathBuf::from(&base).join(run_id);
        assert!(run_dir.join("run-manifest.json").exists());
        assert!(run_dir.join("normalized_matrix.tsv").exists());
        assert!(run_dir.join("pca_plot.svg").exists());
        assert!(run_dir.join("summary_report.txt").exists());

        let locked = events.lock().expect("events lock should succeed");
        let running_step_events = locked
            .iter()
            .filter(|event| matches!(event.phase, crate::shared::run::RunPhase::RunningStep))
            .count();
        assert_eq!(running_step_events, 3);
        assert!(locked.iter().any(|event| {
            event.step_label.as_deref() == Some("Count Normalization")
                && matches!(event.phase, crate::shared::run::RunPhase::RunningStep)
        }));
    }

    #[test]
    fn count_matrix_adapter_fails_when_metadata_is_missing() {
        if !python_available() {
            return;
        }
        let base = temp_dir();
        let matrix_path = PathBuf::from(&base).join("matrix.tsv");
        write_text(&matrix_path, "gene_id\ts1\ts2\nG1\t10\t11\nG2\t5\t6\n");

        let missing_metadata_path = PathBuf::from(&base).join("missing_metadata.tsv");
        let manifest = count_matrix_manifest(
            &base,
            matrix_path.to_string_lossy().as_ref(),
            missing_metadata_path.to_string_lossy().as_ref(),
        );
        let validated = manifest_preflight::validate_run_manifest(manifest)
            .expect("manifest should pass preflight")
            .0;

        let adapter = CountMatrixLocalExecutionAdapter;
        let err = adapter
            .execute(
                &validated,
                AdapterExecutionContext {
                    run_id: "run-missing-metadata".to_string(),
                    cancellation: Arc::new(AtomicBool::new(false)),
                    emit: Arc::new(|_| {}),
                },
            )
            .expect_err("execution should fail when metadata file is missing");
        let message = err.to_user_string();
        assert!(
            message.contains("metadata-not-found") || message.contains("stepId=matrix-validate")
        );
    }

    #[test]
    fn count_matrix_adapter_fails_for_malformed_matrix() {
        if !python_available() {
            return;
        }
        let base = temp_dir();
        let matrix_path = PathBuf::from(&base).join("matrix.tsv");
        let metadata_path = PathBuf::from(&base).join("metadata.tsv");
        write_text(&matrix_path, "gene_id\ts1\ts2\nG1\tabc\t11\nG2\t5\t6\n");
        write_text(&metadata_path, "sample_id\tcondition\ns1\tc\ns2\tt\n");

        let manifest = count_matrix_manifest(
            &base,
            matrix_path.to_string_lossy().as_ref(),
            metadata_path.to_string_lossy().as_ref(),
        );
        let validated = manifest_preflight::validate_run_manifest(manifest)
            .expect("manifest should pass preflight")
            .0;

        let adapter = CountMatrixLocalExecutionAdapter;
        let err = adapter
            .execute(
                &validated,
                AdapterExecutionContext {
                    run_id: "run-malformed-matrix".to_string(),
                    cancellation: Arc::new(AtomicBool::new(false)),
                    emit: Arc::new(|_| {}),
                },
            )
            .expect_err("execution should fail for malformed matrix");
        assert!(err.to_user_string().contains("matrix-non-numeric"));
    }

    #[test]
    fn step_contract_maps_manifest_steps_to_actions() {
        let base = temp_dir();
        let manifest = count_matrix_manifest(&base, "/tmp/matrix.tsv", "/tmp/metadata.tsv");
        let planned = COUNT_MATRIX_CONTRACT
            .plan_steps(&manifest)
            .expect("step planning should succeed");
        assert_eq!(planned.len(), 3);
        assert_eq!(planned[0].manifest_step_id, "matrix-validate");
        assert_eq!(planned[0].action_id, "validate");
        assert_eq!(planned[1].action_id, "normalize");
        assert_eq!(planned[2].action_id, "model");
    }

    #[test]
    fn bulk_rna_matrix_adapter_produces_real_outputs() {
        if !python_available() {
            return;
        }
        let base = temp_dir();
        let matrix_path = PathBuf::from(&base).join("bulk_matrix.tsv");
        let metadata_path = PathBuf::from(&base).join("bulk_metadata.tsv");
        write_text(
            &matrix_path,
            "gene_id\ts1\ts2\ts3\ts4\nG1\t10\t14\t35\t40\nG2\t5\t6\t20\t24\nG3\t100\t95\t110\t120\n",
        );
        write_text(
            &metadata_path,
            "sample_id\tcondition\ns1\tcontrol\ns2\tcontrol\ns3\ttreated\ns4\ttreated\n",
        );
        let manifest = bulk_rna_matrix_manifest(
            &base,
            matrix_path.to_string_lossy().as_ref(),
            metadata_path.to_string_lossy().as_ref(),
        );
        let validated = manifest_preflight::validate_run_manifest(manifest)
            .expect("manifest should pass preflight")
            .0;
        let adapter = BulkRnaMatrixLocalExecutionAdapter;

        let events = Arc::new(Mutex::new(Vec::<AdapterProgressEvent>::new()));
        let events_capture = events.clone();
        let run_id = "run-bulk-rna-matrix".to_string();
        let result = adapter
            .execute(
                &validated,
                AdapterExecutionContext {
                    run_id: run_id.clone(),
                    cancellation: Arc::new(AtomicBool::new(false)),
                    emit: Arc::new(move |event| {
                        events_capture
                            .lock()
                            .expect("events lock should succeed")
                            .push(event);
                    }),
                },
            )
            .expect("bulk-rna matrix adapter execution should succeed");
        assert!(result.completed);

        let run_dir = PathBuf::from(&base).join(run_id);
        assert!(run_dir.join("normalized_matrix.tsv").exists());
        assert!(run_dir.join("pca_plot.svg").exists());
        assert!(run_dir.join("differential_expression.tsv").exists());
        assert!(run_dir.join("volcano_plot.svg").exists());
        assert!(run_dir.join("summary_report.txt").exists());

        let locked = events.lock().expect("events lock should succeed");
        let running_step_events = locked
            .iter()
            .filter(|event| matches!(event.phase, crate::shared::run::RunPhase::RunningStep))
            .count();
        assert_eq!(running_step_events, 3);
        assert!(locked.iter().any(|event| {
            event.step_label.as_deref() == Some("Bulk RNA Differential Expression")
                && matches!(event.phase, crate::shared::run::RunPhase::RunningStep)
        }));
    }

    #[test]
    fn bulk_rna_matrix_adapter_fails_when_grouping_is_invalid() {
        if !python_available() {
            return;
        }
        let base = temp_dir();
        let matrix_path = PathBuf::from(&base).join("bulk_matrix.tsv");
        let metadata_path = PathBuf::from(&base).join("bulk_metadata.tsv");
        write_text(
            &matrix_path,
            "gene_id\ts1\ts2\ts3\nG1\t10\t14\t35\nG2\t5\t6\t20\nG3\t100\t95\t110\n",
        );
        write_text(
            &metadata_path,
            "sample_id\tcondition\ns1\tcontrol\ns2\tcontrol\ns3\tcontrol\n",
        );
        let manifest = bulk_rna_matrix_manifest(
            &base,
            matrix_path.to_string_lossy().as_ref(),
            metadata_path.to_string_lossy().as_ref(),
        );
        let validated = manifest_preflight::validate_run_manifest(manifest)
            .expect("manifest should pass preflight")
            .0;
        let adapter = BulkRnaMatrixLocalExecutionAdapter;
        let err = adapter
            .execute(
                &validated,
                AdapterExecutionContext {
                    run_id: "run-bulk-rna-invalid".to_string(),
                    cancellation: Arc::new(AtomicBool::new(false)),
                    emit: Arc::new(|_| {}),
                },
            )
            .expect_err("bulk-rna matrix should fail when grouping metadata is invalid");
        assert!(err.to_user_string().contains("metadata-grouping-invalid"));
    }

    #[test]
    fn bulk_contract_maps_manifest_steps_to_actions() {
        let base = temp_dir();
        let manifest = bulk_rna_matrix_manifest(&base, "/tmp/matrix.tsv", "/tmp/metadata.tsv");
        let planned = BULK_RNA_MATRIX_CONTRACT
            .plan_steps(&manifest)
            .expect("bulk contract planning should succeed");
        assert_eq!(planned.len(), 3);
        assert_eq!(planned[0].action_id, "validate");
        assert_eq!(planned[1].action_id, "normalize");
        assert_eq!(planned[2].action_id, "differential");
    }
}
