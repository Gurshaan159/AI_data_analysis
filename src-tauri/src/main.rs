// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// WebKitGTK on Linux can hang, show a blank window, or stop repainting on some GPU/Wayland stacks.
/// These defaults are applied before any WebKit process state exists. Override by setting the same
/// variables in your environment before launch (they are not overwritten if already set).
#[cfg(target_os = "linux")]
fn apply_webkit_gtk_linux_defaults() {
    use std::env;
    // SAFETY: `set_var` is only safe when no other thread reads the environment. This runs at the
    // start of `main` before `tauri::Builder` spawns threads.
    unsafe {
        if env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        if env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    apply_webkit_gtk_linux_defaults();
    biology_analysis_desktop_lib::run();
}
