use std::fs::{self, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;

pub fn validate_output_folder(path: &str) -> Result<(), AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidPath("path is empty".to_string()));
    }

    let path_ref = Path::new(path);
    if !path_ref.is_absolute() {
        return Err(AppError::InvalidPath(
            "path must be absolute for deterministic execution context".to_string(),
        ));
    }

    if !path_ref.exists() {
        return Err(AppError::InvalidPath("path does not exist".to_string()));
    }

    if !path_ref.is_dir() {
        return Err(AppError::InvalidPath(
            "path must point to a directory".to_string(),
        ));
    }

    let metadata = std::fs::metadata(path_ref)
        .map_err(|error| AppError::InvalidPath(format!("failed to read path metadata: {error}")))?;
    if metadata.permissions().readonly() {
        return Err(AppError::InvalidPath(
            "path is read-only and not writable".to_string(),
        ));
    }

    // Placeholder usability check: verify this folder can accept writes.
    let probe = build_probe_path(path_ref, "write-probe")?;
    OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&probe)
        .map_err(|error| AppError::InvalidPath(format!("path is not writable: {error}")))?;
    let _ = fs::remove_file(&probe);

    Ok(())
}

pub fn validate_input_file(path: &str) -> Result<(), AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidPath(
            "input file path is empty".to_string(),
        ));
    }

    let path_ref = Path::new(path);
    if !path_ref.is_absolute() {
        return Err(AppError::InvalidPath(
            "input file path must be absolute".to_string(),
        ));
    }

    if !path_ref.exists() {
        return Err(AppError::InvalidPath(
            "input file does not exist".to_string(),
        ));
    }

    if !path_ref.is_file() {
        return Err(AppError::InvalidPath(
            "input path must point to a file".to_string(),
        ));
    }

    let mut handle = OpenOptions::new()
        .read(true)
        .open(path_ref)
        .map_err(|error| AppError::InvalidPath(format!("input file is not readable: {error}")))?;
    let mut scratch = [0_u8; 1];
    let _ = handle.read(&mut scratch);

    Ok(())
}

fn build_probe_path(base: &Path, suffix: &str) -> Result<PathBuf, AppError> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::InvalidPath(error.to_string()))?
        .as_nanos();
    Ok(base.join(format!(".bio-analysis-{suffix}-{stamp}.tmp")))
}
