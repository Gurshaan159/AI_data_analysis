use serde::Serialize;

use crate::services::path_validation;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickFilesResponse {
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickFolderResponse {
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathValidationResponse {
    pub is_valid: bool,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn pick_input_files() -> PickFilesResponse {
    let paths = rfd::FileDialog::new()
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<String>>();

    PickFilesResponse { paths }
}

#[tauri::command]
pub fn pick_output_folder() -> PickFolderResponse {
    let path = rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string());
    PickFolderResponse { path }
}

#[tauri::command]
pub fn validate_path_for_analysis(path: String) -> PathValidationResponse {
    match path_validation::validate_output_folder(&path) {
        Ok(_) => PathValidationResponse {
            is_valid: true,
            reason: None,
        },
        Err(error) => PathValidationResponse {
            is_valid: false,
            reason: Some(error.to_user_string()),
        },
    }
}
