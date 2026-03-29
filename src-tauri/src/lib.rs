mod commands;
mod error;
mod pipelines;
mod services;
mod shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::pick_input_files,
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
