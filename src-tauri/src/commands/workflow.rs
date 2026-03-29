use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;

use crate::pipelines::registry;
use crate::services::config;
use crate::services::execution_manager;
use crate::shared::run;
use crate::shared::types::PipelineDefinition;

#[tauri::command]
pub fn list_registered_pipelines() -> Vec<PipelineDefinition> {
    registry::default_registry()
}

#[tauri::command]
pub fn start_run(
    app: AppHandle,
    request: run::StartRunRequest,
) -> Result<run::RunStartResponse, String> {
    execution_manager::start_run(app, request).map_err(|error| error.to_user_string())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRunRequest {
    pub run_id: String,
}

#[tauri::command]
pub fn cancel_run(request: CancelRunRequest) -> Result<bool, String> {
    execution_manager::cancel_run(&request.run_id).map_err(|error| error.to_user_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendCapabilities {
    pub file_dialog: bool,
    pub folder_dialog: bool,
    pub path_validation: bool,
    pub run_execution: bool,
    pub run_cancellation: bool,
    pub progress_streaming: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendHealthInfo {
    pub status: String,
    pub ai_provider: String,
    pub capabilities: BackendCapabilities,
}

#[tauri::command]
pub fn get_backend_health() -> BackendHealthInfo {
    let app_config = config::AppConfig::load();
    BackendHealthInfo {
        status: "ready".to_string(),
        ai_provider: app_config.ai_provider,
        capabilities: BackendCapabilities {
            file_dialog: true,
            folder_dialog: true,
            path_validation: true,
            run_execution: true,
            run_cancellation: true,
            progress_streaming: true,
        },
    }
}
