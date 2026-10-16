//! Window management: always-on-top, capture exclusion, native opacity, show/hide.

mod exclusion;
pub mod island_tracker;
pub mod layout;
pub mod permissions;

use island_tracker::IslandTrackerState;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use std::sync::Arc;
use parking_lot::Mutex;

pub use exclusion::apply_capture_exclusion;

/// Island + chat are showing (user is signed in past the login/permissions cards).
#[derive(Default)]
pub struct GateState {
    pub overlay: Mutex<bool>,
}

pub fn overlay_active(app: &AppHandle) -> bool {
    *app.state::<GateState>().overlay.lock()
}

/// `true` = overlays receive clicks (Tech Screen default). `false` = click-through.
pub struct OverlayInputState {
    pub interactable: Mutex<bool>,
}

impl Default for OverlayInputState {
    fn default() -> Self {
        Self {
            interactable: Mutex::new(true),
        }
    }
}

pub fn is_overlay_interactable(app: &AppHandle) -> bool {
    *app.state::<OverlayInputState>().interactable.lock()
}

fn set_ignore_cursor(window: &WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

/// Apply chat + island click-through from the current interactable / expanded flags.
pub fn apply_overlay_input(app: &AppHandle) {
    let interactable = is_overlay_interactable(app);
    if let Some(chat) = app.get_webview_window("chat") {
        set_ignore_cursor(&chat, !interactable);
    }
    island_tracker::sync_click_through(app, interactable);
    let _ = app.emit("interactability-changed", interactable);
}

pub fn toggle_interactability(app: &AppHandle) -> bool {
    let next = {
        let state = app.state::<OverlayInputState>();
        let mut flag = state.interactable.lock();
        *flag = !*flag;
        *flag
    };
    apply_overlay_input(app);
    next
}

#[tauri::command]
pub fn overlay_interactable(app: AppHandle) -> bool {
    is_overlay_interactable(&app)
}

/// Keep the island above the chat overlay (both are always-on-top).
pub fn bring_island_to_front(app: &AppHandle) -> Result<(), String> {
    if !overlay_active(app) {
        return Ok(());
    }
    let island = window_by_label(app, "island")?;
    island.show().map_err(|e| e.to_string())?;
    island
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadMarker;
        use objc2::rc::Retained;
        use objc2_app_kit::NSWindow;
        if let Some(_mtm) = MainThreadMarker::new() {
            let ns_ptr = island.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
            unsafe {
                if let Some(ns_window) = Retained::retain(ns_ptr) {
                    // Above normal floating panels (chat), below system menus.
                    ns_window.setLevel(25);
                    ns_window.orderFrontRegardless();
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            BringWindowToTop, SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
        };
        let hwnd = HWND(island.hwnd().map_err(|e| e.to_string())?.0 as *mut _);
        unsafe {
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)
                .map_err(|e| e.to_string())?;
            BringWindowToTop(hwnd).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn bring_island_front(app: AppHandle) -> Result<(), String> {
    bring_island_to_front(&app)
}

fn window_by_label(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label)
        .ok_or_else(|| format!("window '{label}' not found"))
}

#[cfg_attr(
    not(any(target_os = "macos", target_os = "windows")),
    allow(unused_variables)
)]
fn apply_opacity(window: &WebviewWindow, opacity: f64) -> Result<(), String> {
    let clamped = opacity.clamp(0.2, 1.0);

    #[cfg(target_os = "macos")]
    {
        use objc2::rc::Retained;
        use objc2_app_kit::NSWindow;
        let ns_ptr = window.ns_window().map_err(|e| e.to_string())? as *mut NSWindow;
        unsafe {
            let ns_window = Retained::retain(ns_ptr).ok_or("invalid NSWindow")?;
            ns_window.setAlphaValue(clamped);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE,
            LWA_ALPHA, WS_EX_LAYERED,
        };
        let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as *mut _);
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED.0 as isize);
            let alpha = (clamped * 255.0).round() as u8;
            SetLayeredWindowAttributes(hwnd, None, alpha, LWA_ALPHA)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Stealth window setup: always-on-top, hidden from Dock/taskbar, excluded from
/// screen capture / content protection (Tech Screen–style invisibility).
pub fn configure_window(window: &WebviewWindow) -> Result<(), String> {
    window
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;
    window
        .set_skip_taskbar(true)
        .map_err(|e| e.to_string())?;
    window
        .set_visible_on_all_workspaces(true)
        .map_err(|e| e.to_string())?;

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let _ = window.set_content_protected(true);
    }

    apply_capture_exclusion(window)?;
    Ok(())
}

/// Re-apply capture exclusion after show/hide (both overlay windows).
#[tauri::command]
pub fn refresh_capture_exclusion(app: AppHandle) -> Result<(), String> {
    for label in ["chat", "island", "login", "permissions"] {
        if let Some(window) = app.get_webview_window(label) {
            apply_capture_exclusion(&window)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_window_opacity(
    app: AppHandle,
    opacity: f64,
    window: Option<String>,
) -> Result<(), String> {
    let label = window.as_deref().unwrap_or("chat");
    let win = window_by_label(&app, label)?;
    apply_opacity(&win, opacity)
}

/// Grow/shrink the chat overlay to the answer, matching Tech Screen `window:setChatHeight`.
#[tauri::command]
pub fn set_chat_height(app: AppHandle, height: f64) -> Result<(), String> {
    let win = window_by_label(&app, "chat")?;
    let next = layout::clamp_chat_height(height);
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let inner = win
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale);
    if (inner.height - next).abs() < 0.5 {
        return Ok(());
    }
    let width = inner.width.max(layout::CHAT_MIN_WIDTH);
    win.set_min_size(Some(LogicalSize::new(layout::CHAT_MIN_WIDTH, next)))
        .map_err(|e| e.to_string())?;
    win.set_max_size(Some(LogicalSize::new(10_000.0, next)))
        .map_err(|e| e.to_string())?;
    win.set_size(LogicalSize::new(width, next))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_island_expanded(_app: AppHandle, _expanded: bool) -> Result<(), String> {
    Ok(())
}

pub fn start_island_tracking(app: AppHandle, state: Arc<Mutex<IslandTrackerState>>) {
    island_tracker::start_island_tracking(app, state);
}

#[tauri::command]
pub fn dispatch_app_action(app: AppHandle, action: String) -> Result<(), String> {
    app.emit("app-action", action)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Tech Screen: `if (!isDev) app.relaunch(); app.quit()`.
/// `tauri dev` owns this process, so relaunch is skipped and we only quit.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    #[cfg(not(debug_assertions))]
    {
        if let Ok(exe) = std::env::current_exe() {
            let mut cmd = std::process::Command::new(exe);
            cmd.args(std::env::args().skip(1));
            let _ = cmd.spawn();
        }
    }
    app.exit(0);
}

/// Snap the chat window to the left (`direction < 0`) or right edge of its display.
pub fn nudge_chat(app: &AppHandle, direction: i32) -> Result<(), String> {
    let chat = window_by_label(app, "chat")?;
    layout::snap_chat_to_edge(&chat, direction)
}

fn hide_window(app: &AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        // If hide() is ignored on a transparent window, clicks still pass through
        // so a leftover login card cannot block the permissions UI or OS prompts.
        let _ = win.set_ignore_cursor_events(true);
        let _ = win.hide();
    }
}

fn show_window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    let win = window_by_label(app, label)?;
    let _ = win.set_ignore_cursor_events(false);
    let _ = win.set_always_on_top(true);
    win.show().map_err(|e| e.to_string())?;
    let _ = win.set_focus();
    apply_capture_exclusion(&win)?;
    Ok(win)
}

/// Drop always-on-top so macOS/Windows permission dialogs are reachable.
pub(crate) fn lower_gate_windows(app: &AppHandle) {
    for label in ["login", "permissions"] {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.set_always_on_top(false);
        }
    }
}

/// Hide the Dock only in overlay. LSUIElement during login/permissions
/// blocks macOS Screen Recording + Microphone prompts (`tauri dev` especially).
fn set_dock_visible(app: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_dock_visibility(visible);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
}

fn emit_gate(app: &AppHandle, stage: &str) {
    let _ = app.emit("gate", stage);
}

#[tauri::command]
pub fn is_overlay_active(app: AppHandle) -> bool {
    overlay_active(&app)
}

#[tauri::command]
pub fn show_login(app: AppHandle) -> Result<(), String> {
    *app.state::<GateState>().overlay.lock() = false;
    set_dock_visible(&app, true);
    hide_window(&app, "permissions");
    hide_window(&app, "island");
    hide_window(&app, "chat");
    let login = show_window(&app, "login")?;
    let _ = layout::place_card_center(&login);
    emit_gate(&app, "login");
    Ok(())
}

#[tauri::command]
pub fn show_permissions(app: AppHandle) -> Result<(), String> {
    *app.state::<GateState>().overlay.lock() = false;
    set_dock_visible(&app, true);
    hide_window(&app, "login");
    hide_window(&app, "island");
    hide_window(&app, "chat");
    #[cfg(target_os = "windows")]
    if let Some(win) = app.get_webview_window("permissions") {
        let _ = win.set_size(tauri::LogicalSize::new(480.0, 460.0));
    }
    let card = show_window(&app, "permissions")?;
    let _ = layout::place_card_center(&card);
    emit_gate(&app, "permissions");
    Ok(())
}

#[tauri::command]
pub fn enter_overlay(app: AppHandle) -> Result<(), String> {
    *app.state::<GateState>().overlay.lock() = true;
    set_dock_visible(&app, false);
    hide_window(&app, "login");
    hide_window(&app, "permissions");

    let chat = show_window(&app, "chat")?;
    let island = show_window(&app, "island")?;
    let _ = apply_opacity(&island, 1.0);
    let _ = apply_opacity(&chat, 0.88);
    apply_overlay_input(&app);
    bring_island_to_front(&app)?;
    crate::hotkeys::activate_overlay_hotkeys(&app);
    emit_gate(&app, "overlay");
    Ok(())
}

#[tauri::command]
pub fn exit_overlay(app: AppHandle) -> Result<(), String> {
    *app.state::<GateState>().overlay.lock() = false;
    let _ = app.global_shortcut().unregister_all();
    island_tracker::force_collapse(&app);
    if let Some(chat) = app.get_webview_window("chat") {
        set_ignore_cursor(&chat, true);
        let _ = chat.hide();
    }
    if let Some(island) = app.get_webview_window("island") {
        set_ignore_cursor(&island, true);
        let _ = island.hide();
    }
    show_login(app)
}

#[tauri::command]
pub fn advance_after_auth(app: AppHandle) -> Result<(), String> {
    // Tech Screen bootstrap: overlay when screen + mic are already granted.
    if permissions::needs_setup() {
        show_permissions(app)
    } else {
        enter_overlay(app)
    }
}

#[tauri::command]
pub fn toggle_window_visibility(app: AppHandle) -> Result<bool, String> {
    if !overlay_active(&app) {
        return Ok(false);
    }
    let chat = window_by_label(&app, "chat")?;
    let island = window_by_label(&app, "island")?;
    let visible = chat.is_visible().map_err(|e| e.to_string())?;

    if visible {
        island_tracker::force_collapse(&app);
        set_ignore_cursor(&chat, true);
        set_ignore_cursor(&island, true);
        chat.hide().map_err(|e| e.to_string())?;
        island.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        chat.show().map_err(|e| e.to_string())?;
        island.show().map_err(|e| e.to_string())?;
        apply_capture_exclusion(&chat)?;
        apply_capture_exclusion(&island)?;
        bring_island_to_front(&app)?;
        apply_overlay_input(&app);
        Ok(true)
    }
}
