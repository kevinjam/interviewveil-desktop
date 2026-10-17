mod audio;
mod capture;
mod hotkeys;
mod messages;
mod window;

use audio::AudioState;
use hotkeys::HotkeyState;
use tauri::{Manager, WindowEvent};
use window::{configure_window, GateState, OverlayInputState};
use parking_lot::Mutex;
use std::sync::Arc;
use window::island_tracker::IslandTrackerState;
use window::layout::{
    island_window_size, place_chat_upper_right, place_island_top_center, restore_chat_position,
    save_chat_position,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let audio_state = AudioState::new();
    let island_tracker = Arc::new(Mutex::new(IslandTrackerState::default()));
    let island_tracker_setup = island_tracker.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(audio_state)
        .manage(island_tracker.clone())
        .manage(OverlayInputState::default())
        .manage(GateState::default())
        .manage(HotkeyState::default())
        .setup(move |app| {
            let login = app.get_webview_window("login").expect("login window missing");
            let permissions = app
                .get_webview_window("permissions")
                .expect("permissions window missing");
            let island = app
                .get_webview_window("island")
                .expect("island window missing");
            let chat = app.get_webview_window("chat").expect("chat window missing");

            configure_window(&login)?;
            configure_window(&permissions)?;
            configure_window(&island)?;
            configure_window(&chat)?;

            island
                .set_size(island_window_size())
                .map_err(|e| e.to_string())?;
            place_island_top_center(&island)?;
            if !restore_chat_position(app.handle(), &chat)? {
                place_chat_upper_right(&chat)?;
            }

            let _ = permissions.hide();
            let _ = island.hide();
            let _ = chat.hide();

            // Hidden webviews may never load JS, so login must be shown here or
            // show_login never runs and the app looks stuck (no Dock icon either).
            window::show_login(app.handle().clone())?;

            window::start_island_tracking(app.handle().clone(), island_tracker_setup);

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "chat" {
                return;
            }
            if let WindowEvent::Moved(pos) = event {
                if let Err(e) = save_chat_position(window.app_handle(), pos.x, pos.y) {
                    eprintln!("InterviewVeil: save chat position: {e}");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            window::bring_island_front,
            window::refresh_capture_exclusion,
            window::set_window_opacity,
            window::set_chat_height,
            window::set_island_expanded,
            window::island_tracker::island_report_pill_width,
            window::island_tracker::island_report_panel_height,
            window::island_tracker::island_set_locked,
            window::island_tracker::island_expand,
            window::island_tracker::island_collapse,
            window::dispatch_app_action,
            window::quit_app,
            window::toggle_window_visibility,
            window::overlay_interactable,
            window::show_login,
            window::show_permissions,
            window::enter_overlay,
            window::exit_overlay,
            window::sign_out,
            window::advance_after_auth,
            window::is_overlay_active,
            window::permissions::permissions_status,
            window::permissions::permissions_request_screen,
            window::permissions::permissions_request_microphone,
            window::permissions::permissions_open_settings,
            window::permissions::permissions_needs_setup,
            capture::take_screenshot,
            capture::read_screenshots_for_ai,
            capture::delete_screenshot_files,
            audio::start_recording,
            audio::stop_recording,
            hotkeys::update_hotkeys,
            hotkeys::suspend_hotkeys,
            hotkeys::resume_hotkeys,
            window::restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
