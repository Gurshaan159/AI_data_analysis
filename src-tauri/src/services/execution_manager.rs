use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::pipelines::adapters::{
    adapter_for_pipeline, AdapterExecutionContext, AdapterProgressEvent,
};
use crate::services::logger;
use crate::services::manifest_builder;
use crate::services::manifest_preflight;
use crate::services::path_validation;
use crate::shared::manifest::ValidatedRunManifest;
use crate::shared::run::{RunPhase, RunProgressEvent, RunStartResponse, StartRunRequest};
use std::collections::HashMap;

static RUN_CANCELLATION_MAP: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
type RunProgressSink = Arc<dyn Fn(RunProgressEvent) + Send + Sync>;

fn cancellation_map() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    RUN_CANCELLATION_MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn emit_phase(
    sink: &RunProgressSink,
    run_id: &str,
    total_progress: usize,
    phase: RunPhase,
    message: &str,
    step_id: Option<String>,
    step_label: Option<String>,
    progress_index: usize,
) {
    sink(RunProgressEvent {
        run_id: run_id.to_string(),
        phase,
        message: message.to_string(),
        step_id,
        step_label,
        progress_index,
        total_progress,
    });
}

fn cleanup_run(run_id: &str) {
    if let Ok(mut guard) = cancellation_map().lock() {
        guard.remove(run_id);
    }
}

fn validate_request(request: &StartRunRequest) -> Result<(), AppError> {
    if request.selected_pipeline_id.trim().is_empty() {
        return Err(AppError::Config(
            "selected_pipeline_id is required".to_string(),
        ));
    }

    if request.selected_files.is_empty() {
        return Err(AppError::Config(
            "selected_files must include at least one file".to_string(),
        ));
    }

    for file in &request.selected_files {
        if file.path.trim().is_empty() {
            return Err(AppError::Config(
                "selected_files contains an empty path".to_string(),
            ));
        }
        if file.kind.trim().is_empty() {
            return Err(AppError::Config(
                "selected_files contains an empty kind".to_string(),
            ));
        }
        path_validation::validate_input_file(&file.path)?;
    }

    path_validation::validate_output_folder(&request.output_folder)?;

    if request.approved_workflow.pipeline_id.trim().is_empty() {
        return Err(AppError::Config(
            "approved_workflow.pipeline_id is required".to_string(),
        ));
    }
    if request.approved_workflow.pipeline_id != request.selected_pipeline_id {
        return Err(AppError::Config(
            "approved_workflow.pipeline_id must match selected_pipeline_id".to_string(),
        ));
    }
    if request.approved_workflow.approved_at_iso.trim().is_empty() {
        return Err(AppError::Config(
            "approved_workflow.approved_at_iso is required".to_string(),
        ));
    }
    Ok(())
}

fn build_validated_manifest_for_run(
    request: &StartRunRequest,
) -> Result<
    (
        ValidatedRunManifest,
        manifest_preflight::ManifestPreflightResult,
    ),
    AppError,
> {
    let manifest = manifest_builder::build_run_manifest(request);
    manifest_preflight::validate_run_manifest(manifest).map_err(|result| {
        let details = result
            .errors
            .iter()
            .map(|error| format!("{}: {} ({})", error.code, error.message, error.field))
            .collect::<Vec<_>>()
            .join("; ");
        AppError::Config(format!(
            "run manifest preflight failed ({} errors): {}",
            result.summary.error_count, details
        ))
    })
}

pub fn start_run(app: AppHandle, request: StartRunRequest) -> Result<RunStartResponse, AppError> {
    let sink: RunProgressSink = Arc::new(move |event| {
        if let Err(error) = app.emit("run-progress", event) {
            logger::warn(&format!("failed to emit run-progress event: {error}"));
        }
    });
    start_run_with_progress_sink(sink, request)
}

pub fn start_run_with_progress_sink(
    sink: RunProgressSink,
    request: StartRunRequest,
) -> Result<RunStartResponse, AppError> {
    validate_request(&request)?;
    let (validated_manifest, preflight) = build_validated_manifest_for_run(&request)?;
    let manifest = validated_manifest.manifest().clone();

    let run_seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Config(error.to_string()))?
        .as_millis();
    let run_id = format!("run-{}-{run_seed}", request.selected_pipeline_id);
    let cancellation = Arc::new(AtomicBool::new(false));
    cancellation_map()
        .lock()
        .map_err(|_| AppError::Config("failed to lock run registry".to_string()))?
        .insert(run_id.clone(), cancellation.clone());

    logger::info(&format!(
        "Run accepted with manifest '{}' for pipeline '{}' ({} stages, {} inputs, {} expected artifacts)",
        manifest.manifest_id,
        manifest.pipeline.pipeline_id,
        preflight.summary.total_steps,
        preflight.summary.total_inputs,
        preflight.summary.total_expected_artifacts
    ));
    if !preflight.warnings.is_empty() {
        logger::warn(&format!(
            "manifest preflight produced {} warning(s): {}",
            preflight.summary.warning_count,
            preflight
                .warnings
                .iter()
                .map(|warning| format!("{}: {}", warning.code, warning.message))
                .collect::<Vec<_>>()
                .join("; ")
        ));
    }

    let sink_for_thread = sink.clone();
    let run_id_for_thread = run_id.clone();
    let validated_manifest_for_thread = validated_manifest.clone();

    thread::spawn(move || {
        let total_progress = validated_manifest_for_thread
            .manifest()
            .execution_plan
            .stages
            .len()
            + 5;
        let emit_for_adapter = {
            let sink = sink_for_thread.clone();
            let run_id = run_id_for_thread.clone();
            Arc::new(move |event: AdapterProgressEvent| {
                emit_phase(
                    &sink,
                    &run_id,
                    event.total_progress,
                    event.phase,
                    &event.message,
                    event.step_id,
                    event.step_label,
                    event.progress_index,
                )
            })
        };

        let adapter = adapter_for_pipeline(&manifest.pipeline.pipeline_id);
        let context = AdapterExecutionContext {
            run_id: run_id_for_thread.clone(),
            cancellation: cancellation.clone(),
            emit: emit_for_adapter,
        };

        match adapter.execute(&validated_manifest_for_thread, context) {
            Ok(result) => {
                if result.completed {
                    logger::info(&format!("run '{}' completed", run_id_for_thread));
                } else if result.cancelled {
                    logger::info(&format!("run '{}' cancelled", run_id_for_thread));
                } else {
                    logger::warn(&format!(
                        "run '{}' ended with unknown adapter result",
                        run_id_for_thread
                    ));
                }
            }
            Err(error) => {
                emit_phase(
                    &sink_for_thread,
                    &run_id_for_thread,
                    total_progress,
                    RunPhase::Failed,
                    &format!("Execution adapter failed: {}", error.to_user_string()),
                    None,
                    None,
                    total_progress,
                );
                logger::warn(&format!(
                    "run '{}' failed in adapter: {error}",
                    run_id_for_thread
                ));
            }
        }

        cleanup_run(&run_id_for_thread);
    });

    Ok(RunStartResponse {
        run_id,
        initial_phase: RunPhase::Queued,
    })
}

pub fn cancel_run(run_id: &str) -> Result<bool, AppError> {
    let map = cancellation_map()
        .lock()
        .map_err(|_| AppError::Config("failed to lock run registry".to_string()))?;
    if let Some(flag) = map.get(run_id) {
        flag.store(true, Ordering::SeqCst);
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use crate::shared::run::{
        ApprovedWorkflowPayload, ExecutionMode, ModificationOptionPayload, ModificationSlotPayload,
        RunPhase, RunProgressEvent, SelectedFile, StartRunRequest, WorkflowParameterChangePayload,
        WorkflowPayload, WorkflowStepPayload,
    };

    use super::{build_validated_manifest_for_run, start_run_with_progress_sink};

    fn sample_request() -> StartRunRequest {
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

    fn python_available() -> bool {
        Command::new("python3")
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    fn temp_dir(prefix: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{stamp}"));
        fs::create_dir_all(&path).expect("temp directory should be creatable");
        path
    }

    fn write_text(path: &PathBuf, content: &str) {
        fs::write(path, content).expect("fixture write should succeed");
    }

    fn count_matrix_request(
        matrix_path: &PathBuf,
        metadata_path: &PathBuf,
        output_dir: &PathBuf,
    ) -> StartRunRequest {
        let mut selected_modifications = HashMap::new();
        selected_modifications.insert(
            "matrix-normalization-choice".to_string(),
            "size-factor".to_string(),
        );
        StartRunRequest {
            selected_pipeline_id: "count-matrix-analysis-v1".to_string(),
            selected_files: vec![
                SelectedFile {
                    path: matrix_path.to_string_lossy().to_string(),
                    kind: "matrix".to_string(),
                },
                SelectedFile {
                    path: metadata_path.to_string_lossy().to_string(),
                    kind: "metadata".to_string(),
                },
            ],
            output_folder: output_dir.to_string_lossy().to_string(),
            approved_workflow: ApprovedWorkflowPayload {
                pipeline_id: "count-matrix-analysis-v1".to_string(),
                approved_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
                workflow: WorkflowPayload {
                    steps: vec![
                        WorkflowStepPayload {
                            step_id: "matrix-validate".to_string(),
                            display_label: "Matrix and Metadata Validation".to_string(),
                            category: "preprocessing".to_string(),
                            required: true,
                            added_by_ai: false,
                            modified_by_ai: false,
                            explanation: "Validate matrix and metadata".to_string(),
                            parameter_change_summary: vec![],
                            expected_outputs: vec!["summary-report".to_string()],
                        },
                        WorkflowStepPayload {
                            step_id: "matrix-normalize".to_string(),
                            display_label: "Count Normalization".to_string(),
                            category: "normalization".to_string(),
                            required: true,
                            added_by_ai: false,
                            modified_by_ai: false,
                            explanation: "Normalize counts".to_string(),
                            parameter_change_summary: vec![],
                            expected_outputs: vec!["normalized-count-matrix".to_string()],
                        },
                        WorkflowStepPayload {
                            step_id: "matrix-model".to_string(),
                            display_label: "Differential Modeling".to_string(),
                            category: "statistical-analysis".to_string(),
                            required: true,
                            added_by_ai: false,
                            modified_by_ai: false,
                            explanation: "Build differential summary".to_string(),
                            parameter_change_summary: vec![],
                            expected_outputs: vec![
                                "differential-expression-table".to_string(),
                                "summary-report".to_string(),
                            ],
                        },
                    ],
                    modification_slots: vec![ModificationSlotPayload {
                        id: "matrix-normalization-choice".to_string(),
                        label: "Normalization Method".to_string(),
                        supported_options: vec![
                            ModificationOptionPayload {
                                id: "size-factor".to_string(),
                                label: "Size Factor".to_string(),
                                effect_summary: "General-purpose count scaling.".to_string(),
                            },
                            ModificationOptionPayload {
                                id: "tmm-like".to_string(),
                                label: "TMM-Like".to_string(),
                                effect_summary: "Robust to composition differences.".to_string(),
                            },
                        ],
                    }],
                },
            },
            selected_modifications,
            execution_mode: ExecutionMode::MockLocal,
        }
    }

    fn bulk_rna_matrix_request(
        matrix_path: &PathBuf,
        metadata_path: &PathBuf,
        output_dir: &PathBuf,
    ) -> StartRunRequest {
        let mut selected_modifications = HashMap::new();
        selected_modifications.insert(
            "bulk-matrix-normalization-choice".to_string(),
            "size-factor".to_string(),
        );
        StartRunRequest {
            selected_pipeline_id: "bulk-rna-matrix-downstream-v1".to_string(),
            selected_files: vec![
                SelectedFile {
                    path: matrix_path.to_string_lossy().to_string(),
                    kind: "matrix".to_string(),
                },
                SelectedFile {
                    path: metadata_path.to_string_lossy().to_string(),
                    kind: "metadata".to_string(),
                },
            ],
            output_folder: output_dir.to_string_lossy().to_string(),
            approved_workflow: ApprovedWorkflowPayload {
                pipeline_id: "bulk-rna-matrix-downstream-v1".to_string(),
                approved_at_iso: "2026-03-28T10:00:00.000Z".to_string(),
                workflow: WorkflowPayload {
                    steps: vec![
                        WorkflowStepPayload {
                            step_id: "bulk-matrix-validate".to_string(),
                            display_label: "Bulk Matrix and Metadata Validation".to_string(),
                            category: "preprocessing".to_string(),
                            required: true,
                            added_by_ai: false,
                            modified_by_ai: false,
                            explanation: "Validate matrix and metadata".to_string(),
                            parameter_change_summary: vec![],
                            expected_outputs: vec!["summary-report".to_string()],
                        },
                        WorkflowStepPayload {
                            step_id: "bulk-matrix-normalize".to_string(),
                            display_label: "Bulk RNA Normalization and PCA".to_string(),
                            category: "normalization".to_string(),
                            required: true,
                            added_by_ai: false,
                            modified_by_ai: false,
                            explanation: "Normalize and produce PCA".to_string(),
                            parameter_change_summary: vec![],
                            expected_outputs: vec![
                                "normalized-count-matrix".to_string(),
                                "summary-report".to_string(),
                            ],
                        },
                        WorkflowStepPayload {
                            step_id: "bulk-matrix-model".to_string(),
                            display_label: "Bulk RNA Differential Expression".to_string(),
                            category: "statistical-analysis".to_string(),
                            required: true,
                            added_by_ai: false,
                            modified_by_ai: false,
                            explanation: "Compute differential outputs".to_string(),
                            parameter_change_summary: vec![],
                            expected_outputs: vec![
                                "differential-expression-table".to_string(),
                                "volcano-plot".to_string(),
                                "summary-report".to_string(),
                            ],
                        },
                    ],
                    modification_slots: vec![ModificationSlotPayload {
                        id: "bulk-matrix-normalization-choice".to_string(),
                        label: "Normalization Method".to_string(),
                        supported_options: vec![
                            ModificationOptionPayload {
                                id: "size-factor".to_string(),
                                label: "Size Factor".to_string(),
                                effect_summary: "General-purpose count scaling.".to_string(),
                            },
                            ModificationOptionPayload {
                                id: "tmm-like".to_string(),
                                label: "TMM-Like".to_string(),
                                effect_summary: "Robust to composition differences.".to_string(),
                            },
                        ],
                    }],
                },
            },
            selected_modifications,
            execution_mode: ExecutionMode::MockLocal,
        }
    }

    fn wait_for_terminal_event(events: &Arc<Mutex<Vec<RunProgressEvent>>>) -> RunProgressEvent {
        let timeout = Duration::from_secs(15);
        let started = SystemTime::now();
        loop {
            let snapshot = events.lock().expect("events lock should succeed").clone();
            if let Some(done) = snapshot.into_iter().find(|event| {
                matches!(
                    event.phase,
                    RunPhase::Completed | RunPhase::Failed | RunPhase::Cancelled
                )
            }) {
                return done;
            }
            if started.elapsed().unwrap_or_default() > timeout {
                panic!("timed out waiting for terminal run-progress event");
            }
            thread::sleep(Duration::from_millis(25));
        }
    }

    fn phase_count(events: &[RunProgressEvent], phase: RunPhase) -> usize {
        events.iter().filter(|event| event.phase == phase).count()
    }

    #[test]
    fn blocks_execution_when_manifest_preflight_fails() {
        let mut request = sample_request();
        request.selected_modifications.clear();
        let result = build_validated_manifest_for_run(&request);
        assert!(result.is_err());
    }

    #[test]
    fn count_matrix_pipeline_passes_through_start_run_boundary() {
        if !python_available() {
            return;
        }
        let fixture_dir = temp_dir("run-boundary-count-matrix");
        let matrix_path = fixture_dir.join("matrix.tsv");
        let metadata_path = fixture_dir.join("metadata.tsv");
        write_text(
            &matrix_path,
            "gene_id\ts1\ts2\ts3\nG1\t10\t15\t20\nG2\t5\t4\t8\nG3\t20\t30\t25\n",
        );
        write_text(
            &metadata_path,
            "sample_id\tcondition\ns1\tcontrol\ns2\ttreated\ns3\ttreated\n",
        );

        let request = count_matrix_request(&matrix_path, &metadata_path, &fixture_dir);
        let events = Arc::new(Mutex::new(Vec::<RunProgressEvent>::new()));
        let events_capture = events.clone();
        let sink = Arc::new(move |event: RunProgressEvent| {
            events_capture
                .lock()
                .expect("events lock should succeed")
                .push(event);
        });
        let start = start_run_with_progress_sink(sink, request).expect("start_run should accept");
        assert!(start.run_id.starts_with("run-count-matrix-analysis-v1-"));

        let terminal = wait_for_terminal_event(&events);
        assert_eq!(terminal.phase, RunPhase::Completed);
        assert_eq!(terminal.run_id, start.run_id);
        let snapshot = events.lock().expect("events lock should succeed").clone();
        assert!(phase_count(&snapshot, RunPhase::Queued) >= 1);
        assert!(phase_count(&snapshot, RunPhase::Validating) >= 1);
        assert!(phase_count(&snapshot, RunPhase::Preparing) >= 1);
        assert_eq!(phase_count(&snapshot, RunPhase::RunningStep), 3);
        assert!(phase_count(&snapshot, RunPhase::Finalizing) >= 1);
        assert!(phase_count(&snapshot, RunPhase::Completed) >= 1);
        assert!(snapshot.iter().any(|event| {
            event.phase == RunPhase::RunningStep
                && event.step_id.as_deref() == Some("matrix-normalize")
        }));

        let run_dir = fixture_dir.join(&start.run_id);
        assert!(run_dir.join("run-manifest.json").exists());
        assert!(run_dir.join("run-provenance.json").exists());
        assert!(run_dir.join("normalized_matrix.tsv").exists());
        assert!(run_dir.join("pca_plot.svg").exists());
        assert!(run_dir.join("summary_report.txt").exists());
        assert!(run_dir.join("differential_analysis.tsv").exists());
    }

    #[test]
    fn bulk_rna_matrix_pipeline_passes_through_start_run_boundary() {
        if !python_available() {
            return;
        }
        let fixture_dir = temp_dir("run-boundary-bulk-rna");
        let matrix_path = fixture_dir.join("matrix.tsv");
        let metadata_path = fixture_dir.join("metadata.tsv");
        write_text(
            &matrix_path,
            "gene_id\ts1\ts2\ts3\ts4\nG1\t10\t14\t35\t40\nG2\t5\t6\t20\t24\nG3\t100\t95\t110\t120\n",
        );
        write_text(
            &metadata_path,
            "sample_id\tcondition\ns1\tcontrol\ns2\tcontrol\ns3\ttreated\ns4\ttreated\n",
        );

        let request = bulk_rna_matrix_request(&matrix_path, &metadata_path, &fixture_dir);
        let events = Arc::new(Mutex::new(Vec::<RunProgressEvent>::new()));
        let events_capture = events.clone();
        let sink = Arc::new(move |event: RunProgressEvent| {
            events_capture
                .lock()
                .expect("events lock should succeed")
                .push(event);
        });
        let start = start_run_with_progress_sink(sink, request).expect("start_run should accept");
        assert!(start.run_id.starts_with("run-bulk-rna-matrix-downstream-v1-"));

        let terminal = wait_for_terminal_event(&events);
        assert_eq!(terminal.phase, RunPhase::Completed);
        assert_eq!(terminal.run_id, start.run_id);
        let snapshot = events.lock().expect("events lock should succeed").clone();
        assert!(phase_count(&snapshot, RunPhase::Queued) >= 1);
        assert!(phase_count(&snapshot, RunPhase::Validating) >= 1);
        assert!(phase_count(&snapshot, RunPhase::Preparing) >= 1);
        assert_eq!(phase_count(&snapshot, RunPhase::RunningStep), 3);
        assert!(phase_count(&snapshot, RunPhase::Finalizing) >= 1);
        assert!(phase_count(&snapshot, RunPhase::Completed) >= 1);
        assert!(snapshot.iter().any(|event| {
            event.phase == RunPhase::RunningStep
                && event.step_id.as_deref() == Some("bulk-matrix-model")
        }));

        let run_dir = fixture_dir.join(&start.run_id);
        assert!(run_dir.join("run-manifest.json").exists());
        assert!(run_dir.join("run-provenance.json").exists());
        assert!(run_dir.join("normalized_matrix.tsv").exists());
        assert!(run_dir.join("pca_plot.svg").exists());
        assert!(run_dir.join("differential_expression.tsv").exists());
        assert!(run_dir.join("volcano_plot.svg").exists());
        assert!(run_dir.join("summary_report.txt").exists());
    }

    #[test]
    fn invalid_input_surfaces_structured_failure_through_start_run_boundary() {
        if !python_available() {
            return;
        }
        let fixture_dir = temp_dir("run-boundary-failure");
        let matrix_path = fixture_dir.join("matrix.tsv");
        let metadata_path = fixture_dir.join("metadata.tsv");
        write_text(
            &matrix_path,
            "gene_id\ts1\ts2\nG1\tabc\t11\nG2\t5\t6\n",
        );
        write_text(
            &metadata_path,
            "sample_id\tcondition\ns1\tcontrol\ns2\ttreated\n",
        );

        let request = count_matrix_request(&matrix_path, &metadata_path, &fixture_dir);
        let events = Arc::new(Mutex::new(Vec::<RunProgressEvent>::new()));
        let events_capture = events.clone();
        let sink = Arc::new(move |event: RunProgressEvent| {
            events_capture
                .lock()
                .expect("events lock should succeed")
                .push(event);
        });
        let start = start_run_with_progress_sink(sink, request).expect("start_run should accept");

        let terminal = wait_for_terminal_event(&events);
        assert_eq!(terminal.phase, RunPhase::Failed);
        assert_eq!(terminal.run_id, start.run_id);
        assert!(terminal.message.contains("Execution adapter failed"));
        assert!(terminal.message.contains("script step failed"));
        assert!(terminal.message.contains("code=matrix-non-numeric"));
        assert!(terminal.message.contains("status=error"));
    }
}
