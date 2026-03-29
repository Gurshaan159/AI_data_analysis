use std::path::PathBuf;

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

        let outputs = parse_success_payload(&result.stdout, context, &invocation.action).map_err(|error| {
            AppError::CommandExecution(format!(
                "script output parsing failed [pipeline={}, stepId={}, action={}]: {error}",
                context.pipeline_id, context.step_id, context.action_id
            ))
        })?;

        Ok(ScriptRunResult {
            outputs,
            stdout: result.stdout,
            stderr: result.stderr,
        })
    }
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
