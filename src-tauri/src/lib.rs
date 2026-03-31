mod commands;
mod error;
mod pipelines;
mod services;
mod shared;

/// Load repo-root `.env` into the process so `std::env::var("VITE_*")` matches the frontend (Vite loads the same file).
fn load_project_dotenv() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env");
    let _ = dotenvy::from_path(path);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_project_dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::pick_output_folder,
            commands::files::validate_path_for_analysis,
            commands::workflow::list_registered_pipelines,
            commands::workflow::start_run,
            commands::workflow::cancel_run,
            commands::workflow::get_backend_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
