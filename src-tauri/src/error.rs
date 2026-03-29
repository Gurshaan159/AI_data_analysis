use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("command execution failed: {0}")]
    CommandExecution(String),
    #[error("configuration error: {0}")]
    Config(String),
}

impl AppError {
    pub fn to_user_string(&self) -> String {
        self.to_string()
    }
}
