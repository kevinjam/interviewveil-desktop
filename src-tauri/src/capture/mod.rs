//! Screenshot capture (Tech Screen–style: fast capture, disk store, JPEG on send).

mod screenshot;
#[cfg(target_os = "macos")]
mod macos_sck;

pub use screenshot::{capture_screen, ScreenshotResult};

#[cfg(target_os = "macos")]
pub fn prime_screen_capture() {
    macos_sck::prime();
}

/// Capture the display under the chat window. Runs off the UI thread so shortcuts don't freeze.
#[tauri::command]
pub async fn take_screenshot(app: tauri::AppHandle) -> Result<ScreenshotResult, String> {
    tauri::async_runtime::spawn_blocking(move || capture_screen(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// Encode queued screenshot files for the AI proxy (JPEG q80, ≤1920×1080).
#[tauri::command]
pub async fn read_screenshots_for_ai(
    paths: Vec<String>,
) -> Result<Vec<screenshot::ScreenshotPayload>, String> {
    tauri::async_runtime::spawn_blocking(move || screenshot::read_for_ai(&paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_screenshot_files(paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        screenshot::delete_files(&paths);
    })
    .await
    .map_err(|e| e.to_string())
}
