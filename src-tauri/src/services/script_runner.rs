use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::error::AppError;
use crate::services::command_runner::{CommandExecutor, CommandRunRequest, ProcessCommandExecutor};

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum ScriptRuntime {
    Python3,
    Rscript,
}

impl ScriptRuntime {
    fn executable(self) -> &'static str {
        match self {
            ScriptRuntime::Python3 => "python3",
            ScriptRuntime::Rscript => "Rscript",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ScriptArgument {
    pub key: String,
    pub value: String,
}

impl ScriptArgument {
    pub fn new(key: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            value: value.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ScriptInvocation {
    pub runtime: ScriptRuntime,
    pub script_path: PathBuf,
    pub action: String,
    pub output_dir: PathBuf,
    pub args: Vec<ScriptArgument>,
}

#[derive(Debug, Clone)]
pub struct ScriptErrorContext {
    pub pipeline_id: String,
    pub step_id: String,
    pub action_id: String,
}

#[derive(Debug, Clone)]
pub struct ScriptRunResult {
    pub outputs: Vec<PathBuf>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ScriptErrorPayload {
    #[serde(default)]
    status: Option<String>,
    code: String,
    message: String,
    #[serde(default)]
    details: serde_json::Map<String, serde_json::Value>,
}

/// Successful step: one JSON object on stdout; see `src-tauri/docs/SCRIPT_SUCCESS_PAYLOAD.md`.
#[derive(Debug, Clone, Deserialize)]
struct ScriptSuccessPayload {
    status: String,
    action: String,
    outputs: Vec<String>,
}

pub struct ScriptRunner<E: CommandExecutor> {
    executor: E,
}

impl Default for ScriptRunner<ProcessCommandExecutor> {
    fn default() -> Self {
        Self {
            executor: ProcessCommandExecutor,
        }
    }
}

impl<E: CommandExecutor> ScriptRunner<E> {
    pub fn run(
        &self,
        invocation: &ScriptInvocation,
        context: &ScriptErrorContext,
    ) -> Result<ScriptRunResult, AppError> {
        let mut args: Vec<String> = vec![
            invocation.script_path.to_string_lossy().to_string(),
            "--action".to_string(),
            invocation.action.clone(),
            "--output-dir".to_string(),
            invocation.output_dir.to_string_lossy().to_string(),
        ];
        for argument in &invocation.args {
            args.push(argument.key.clone());
            args.push(argument.value.clone());
        }

        let request = CommandRunRequest {
            executable: invocation.runtime.executable().to_string(),
            args,
            working_dir: None,
        };
        let result = self.executor.run(&request)?;

        if result.exit_code != 0 {
            return Err(to_script_error(context, result.exit_code, &result.stderr));
        }

        let reported_outputs = parse_success_payload(&result.stdout, context, &invocation.action).map_err(|error| {
            AppError::CommandExecution(format!(
                "script output parsing failed [pipeline={}, stepId={}, action={}]: {error}",
                context.pipeline_id, context.step_id, context.action_id
            ))
        })?;
        let outputs = validate_reported_outputs(
            &invocation.output_dir,
            reported_outputs,
            context,
            &invocation.action,
        )?;

        Ok(ScriptRunResult {
            outputs,
            stdout: result.stdout,
            stderr: result.stderr,
        })
    }
}

fn validate_reported_outputs(
    output_dir: &Path,
    reported_outputs: Vec<PathBuf>,
    context: &ScriptErrorContext,
    expected_action: &str,
) -> Result<Vec<PathBuf>, AppError> {
    let canonical_output_dir = output_dir.canonicalize().map_err(|error| {
        AppError::CommandExecution(format!(
            "script output validation failed [pipeline={}, stepId={}, action={}]: output_dir '{}' is invalid or missing: {}",
            context.pipeline_id,
            context.step_id,
            context.action_id,
            output_dir.display(),
            error
        ))
    })?;

    reported_outputs
        .into_iter()
        .map(|reported| {
            let resolved = if reported.is_relative() {
                output_dir.join(&reported)
            } else {
                reported
            };
            let canonical_resolved = resolved.canonicalize().map_err(|error| {
                AppError::CommandExecution(format!(
                    "script output validation failed [pipeline={}, stepId={}, action={}]: reported output '{}' for action '{}' does not exist or is unreadable: {}",
                    context.pipeline_id,
                    context.step_id,
                    context.action_id,
                    resolved.display(),
                    expected_action,
                    error
                ))
            })?;
            if !canonical_resolved.starts_with(&canonical_output_dir) {
                return Err(AppError::CommandExecution(format!(
                    "script output validation failed [pipeline={}, stepId={}, action={}]: reported output '{}' resolves outside output_dir '{}'",
                    context.pipeline_id,
                    context.step_id,
                    context.action_id,
                    resolved.display(),
                    canonical_output_dir.display()
                )));
            }
            Ok(canonical_resolved)
        })
        .collect()
}

fn parse_success_payload(
    stdout: &str,
    context: &ScriptErrorContext,
    expected_action: &str,
) -> Result<Vec<PathBuf>, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("stdout payload was empty".to_string());
    }

    let payload = serde_json::from_str::<ScriptSuccessPayload>(trimmed)
        .map_err(|error| format!("invalid success payload JSON: {error}"))?;
    if payload.status != "ok" {
        return Err(format!(
            "success payload status must be 'ok' for action '{}', got '{}'",
            expected_action, payload.status
        ));
    }
    if payload.action != expected_action {
        return Err(format!(
            "success payload action mismatch for pipeline='{}', stepId='{}': expected '{}', got '{}'",
            context.pipeline_id, context.step_id, expected_action, payload.action
        ));
    }
    Ok(payload.outputs.into_iter().map(PathBuf::from).collect())
}

fn to_script_error(context: &ScriptErrorContext, exit_code: i32, stderr: &str) -> AppError {
    let trimmed = stderr.trim();
    if let Ok(payload) = serde_json::from_str::<ScriptErrorPayload>(trimmed) {
        let status = payload.status.unwrap_or_else(|| "error".to_string());
        let details_suffix = if payload.details.is_empty() {
            String::new()
        } else {
            format!(", details={}", serde_json::Value::Object(payload.details))
        };
        return AppError::CommandExecution(format!(
            "script step failed [pipeline={}, stepId={}, action={}, status={}, code={}, exitCode={}{}]: {}",
            context.pipeline_id,
            context.step_id,
            context.action_id,
            status,
            payload.code,
            exit_code,
            details_suffix,
            payload.message
        ));
    }

    AppError::CommandExecution(format!(
        "script step failed [pipeline={}, stepId={}, action={}, code=script-exit-nonzero, exitCode={}]: {}",
        context.pipeline_id,
        context.step_id,
        context.action_id,
        exit_code,
        if trimmed.is_empty() {
            "script returned non-zero status with empty stderr"
        } else {
            trimmed
        }
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::services::command_runner::{CommandRunRequest, CommandRunResult};

    use super::{
        ScriptErrorContext, ScriptInvocation, ScriptRunResult, ScriptRunner, ScriptRuntime,
    };
    use crate::error::AppError;
    use crate::services::command_runner::CommandExecutor;

    struct FakeExecutor {
        result: CommandRunResult,
    }

    impl CommandExecutor for FakeExecutor {
        fn run(&self, _request: &CommandRunRequest) -> Result<CommandRunResult, AppError> {
            Ok(self.result.clone())
        }
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

    fn invocation(output_dir: PathBuf, action: &str) -> ScriptInvocation {
        ScriptInvocation {
            runtime: ScriptRuntime::Python3,
            script_path: PathBuf::from("/tmp/fake_script.py"),
            action: action.to_string(),
            output_dir,
            args: vec![],
        }
    }

    fn context(action: &str) -> ScriptErrorContext {
        ScriptErrorContext {
            pipeline_id: "count-matrix-analysis-v1".to_string(),
            step_id: "matrix-normalize".to_string(),
            action_id: action.to_string(),
        }
    }

    fn run_with_stdout(output_dir: PathBuf, action: &str, stdout: &str) -> Result<ScriptRunResult, AppError> {
        let runner = ScriptRunner {
            executor: FakeExecutor {
                result: CommandRunResult {
                    exit_code: 0,
                    stdout: stdout.to_string(),
                    stderr: String::new(),
                },
            },
        };
        runner.run(&invocation(output_dir, action), &context(action))
    }

    #[test]
    fn accepts_valid_relative_output_inside_output_dir() {
        let dir = temp_dir("script-runner-valid-relative");
        let file = dir.join("results.tsv");
        fs::write(&file, "ok\n").expect("fixture file should be writable");
        let stdout = r#"{"status":"ok","action":"normalize","outputs":["results.tsv"]}"#;

        let result = run_with_stdout(dir, "normalize", stdout).expect("run should succeed");
        assert_eq!(result.outputs.len(), 1);
        assert!(result.outputs[0].ends_with("results.tsv"));
    }

    #[test]
    fn accepts_valid_nested_relative_output_inside_output_dir() {
        let dir = temp_dir("script-runner-valid-nested");
        let nested = dir.join("plots");
        fs::create_dir_all(&nested).expect("nested dir should be creatable");
        let file = nested.join("volcano.png");
        fs::write(&file, "ok\n").expect("fixture file should be writable");
        let stdout = r#"{"status":"ok","action":"normalize","outputs":["plots/volcano.png"]}"#;

        let result = run_with_stdout(dir, "normalize", stdout).expect("run should succeed");
        assert_eq!(result.outputs.len(), 1);
        assert!(result.outputs[0].ends_with("plots/volcano.png"));
    }

    #[test]
    fn rejects_relative_traversal_outside_output_dir() {
        let root = temp_dir("script-runner-traversal");
        let output_dir = root.join("out");
        fs::create_dir_all(&output_dir).expect("output dir should be creatable");
        let outside = root.join("outside.tsv");
        fs::write(&outside, "outside\n").expect("outside file should be writable");
        let stdout = r#"{"status":"ok","action":"normalize","outputs":["../outside.tsv"]}"#;

        let err = run_with_stdout(output_dir, "normalize", stdout).expect_err("run should fail");
        assert!(err
            .to_user_string()
            .contains("resolves outside output_dir"));
    }

    #[test]
    fn rejects_absolute_output_outside_output_dir() {
        let root = temp_dir("script-runner-absolute");
        let output_dir = root.join("out");
        fs::create_dir_all(&output_dir).expect("output dir should be creatable");
        let outside = root.join("outside.tsv");
        fs::write(&outside, "outside\n").expect("outside file should be writable");
        let stdout = format!(
            r#"{{"status":"ok","action":"normalize","outputs":["{}"]}}"#,
            outside.display()
        );

        let err = run_with_stdout(output_dir, "normalize", &stdout).expect_err("run should fail");
        assert!(err
            .to_user_string()
            .contains("resolves outside output_dir"));
    }

    #[test]
    fn rejects_reported_output_that_does_not_exist() {
        let output_dir = temp_dir("script-runner-missing");
        let stdout = r#"{"status":"ok","action":"normalize","outputs":["missing.tsv"]}"#;

        let err = run_with_stdout(output_dir, "normalize", stdout).expect_err("run should fail");
        assert!(err
            .to_user_string()
            .contains("does not exist or is unreadable"));
    }

    #[test]
    fn accepts_absolute_output_inside_output_dir() {
        let output_dir = temp_dir("script-runner-absolute-inside");
        let file = output_dir.join("summary.txt");
        fs::write(&file, "ok\n").expect("fixture file should be writable");
        let stdout = format!(
            r#"{{"status":"ok","action":"model","outputs":["{}"]}}"#,
            file.display()
        );

        let result = run_with_stdout(output_dir, "model", &stdout).expect("run should succeed");
        assert_eq!(result.outputs.len(), 1);
        assert!(result.outputs[0].ends_with("summary.txt"));
    }
}
