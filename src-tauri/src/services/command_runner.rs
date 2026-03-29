use std::process::Command;

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct CommandRunRequest {
    pub executable: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CommandRunResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub trait CommandExecutor {
    fn run(&self, request: &CommandRunRequest) -> Result<CommandRunResult, AppError>;
}

pub struct ProcessCommandExecutor;

impl CommandExecutor for ProcessCommandExecutor {
    fn run(&self, request: &CommandRunRequest) -> Result<CommandRunResult, AppError> {
        let mut command = Command::new(&request.executable);
        command.args(&request.args);

        if let Some(working_dir) = &request.working_dir {
            command.current_dir(working_dir);
        }

        let output = command
            .output()
            .map_err(|error| AppError::CommandExecution(error.to_string()))?;

        Ok(CommandRunResult {
            exit_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}
