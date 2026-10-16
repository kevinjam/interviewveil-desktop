//! Island hover: click-through when collapsed, cursor hit-testing on the main thread.

use parking_lot::Mutex;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

use super::layout::{
    COLLAPSED_MARGIN, ISLAND_PANEL_W, PILL_H, PILL_MAX_W, PILL_MIN_W,
};

const PILL_H_U: u32 = 38;
const PANEL_MAX_H_U: u32 = 460;
const HIT_PAD: f64 = 6.0;

#[derive(Debug, Default)]
pub struct IslandTrackerState {
    pub pill_width: u32,
    pub panel_height: u32,
    pub locked: bool,
    pub expanded: bool,
}

fn within(px: f64, py: f64, x: f64, y: f64, w: f64, h: f64) -> bool {
    px >= x && px <= x + w && py >= y && py <= y + h
}

fn set_island_ignore(app: &AppHandle, ignore: bool) {
    if let Some(win) = app.get_webview_window("island") {
        let _ = win.set_ignore_cursor_events(ignore);
    }
}

fn apply_expanded(app: &AppHandle, state: &Arc<Mutex<IslandTrackerState>>, expanded: bool) {
    if expanded && !super::is_overlay_interactable(app) {
        return;
    }
    let mut s = state.lock();
    if s.expanded == expanded {
        return;
    }
    s.expanded = expanded;
    drop(s);
    set_island_ignore(app, !expanded);
    let _ = app.emit("island:expanded", expanded);
    if expanded {
        let _ = super::bring_island_to_front(app);
    }
}

/// Match Tech Screen: click-through while collapsed; receive clicks while expanded.
pub(super) fn sync_click_through(app: &AppHandle, interactable: bool) {
    if !interactable {
        force_collapse(app);
        return;
    }
    let expanded = app
        .state::<Arc<Mutex<IslandTrackerState>>>()
        .lock()
        .expanded;
    set_island_ignore(app, !expanded);
}

/// Collapse even if the menu was locked (hide / click-through).
pub(super) fn force_collapse(app: &AppHandle) {
    let state = app.state::<Arc<Mutex<IslandTrackerState>>>();
    state.lock().locked = false;
    apply_expanded(app, state.inner(), false);
    set_island_ignore(app, true);
}

/// Global cursor in the same logical space as Electron `screen.getCursorScreenPoint()`.
fn global_cursor_logical() -> Option<(f64, f64)> {
    #[cfg(target_os = "macos")]
    {
        let (x, y) = readmouse::Mouse::location();
        Some((x, y))
    }
    #[cfg(target_os = "windows")]
    {
        use device_query::{DeviceQuery, DeviceState};
        let state = DeviceState::checked_new()?;
        let mouse = state.get_mouse();
        Some((mouse.coords.0 as f64, mouse.coords.1 as f64))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

fn window_bounds_logical(
    island: &tauri::WebviewWindow,
) -> Option<(f64, f64, f64)> {
    let scale = island.scale_factor().unwrap_or(1.0);
    let pos: PhysicalPosition<i32> = island.outer_position().ok()?;
    let size: PhysicalSize<u32> = island.outer_size().ok()?;
    let wx = pos.x as f64 / scale;
    let wy = pos.y as f64 / scale;
    let ww = size.width as f64 / scale;
    Some((wx, wy, ww))
}

/// Must run on the main thread — all `WebviewWindow` / AppKit access happens here.
fn track_frame(app: &AppHandle, state: &Arc<Mutex<IslandTrackerState>>, px: f64, py: f64) {
    if !super::is_overlay_interactable(app) {
        return;
    }

    let island = app.get_webview_window("island");
    let island = match island {
        Some(w) if w.is_visible().unwrap_or(false) => w,
        _ => return,
    };

    let (wx, wy, ww) = match window_bounds_logical(&island) {
        Some(b) => b,
        None => return,
    };

    let snapshot = {
        let s = state.lock();
        (
            s.pill_width.clamp(PILL_MIN_W, PILL_MAX_W) as f64,
            s.panel_height.clamp(PILL_H_U, PANEL_MAX_H_U) as f64,
            s.locked,
            s.expanded,
        )
    };

    let (pill_w, panel_h, locked, expanded) = snapshot;
    let margin = COLLAPSED_MARGIN as f64;
    let pill_h = PILL_H as f64;
    let panel_w = ISLAND_PANEL_W as f64;

    let pill_x = wx + (ww - pill_w) / 2.0 - HIT_PAD;
    let pill_y = wy + margin - HIT_PAD;
    let pill_w_hit = pill_w + HIT_PAD * 2.0;
    let pill_h_hit = pill_h + HIT_PAD * 2.0;

    let panel_x = wx + (ww - panel_w) / 2.0;
    let panel_y = wy;

    let in_pill = within(px, py, pill_x, pill_y, pill_w_hit, pill_h_hit);

    if !expanded && in_pill {
        apply_expanded(app, state, true);
    } else if expanded && !locked && !within(px, py, panel_x, panel_y, panel_w, panel_h)
    {
        apply_expanded(app, state, false);
    }
}

pub fn start_island_tracking(app: AppHandle, state: Arc<Mutex<IslandTrackerState>>) {
    {
        let mut s = state.lock();
        s.pill_width = 380;
        s.panel_height = 320;
        s.expanded = false;
        s.locked = false;
    }

    set_island_ignore(&app, true);

    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(16));
            let cursor = global_cursor_logical();
            let Some((px, py)) = cursor else {
                continue;
            };
            let app_main = app.clone();
            let state = state.clone();
            let _ = app.run_on_main_thread(move || {
                track_frame(&app_main, &state, px, py);
            });
        }
    });
}

#[tauri::command]
pub fn island_report_pill_width(
    state: tauri::State<'_, Arc<Mutex<IslandTrackerState>>>,
    width: u32,
) {
    state.lock().pill_width = width.clamp(PILL_MIN_W, PILL_MAX_W);
}

#[tauri::command]
pub fn island_report_panel_height(
    state: tauri::State<'_, Arc<Mutex<IslandTrackerState>>>,
    height: u32,
) {
    state.lock().panel_height = height.clamp(PILL_H_U, PANEL_MAX_H_U);
}

#[tauri::command]
pub fn island_set_locked(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<IslandTrackerState>>>,
    locked: bool,
) {
    state.lock().locked = locked;
    if locked && super::is_overlay_interactable(&app) {
        set_island_ignore(&app, false);
    }
}

#[tauri::command]
pub fn island_expand(app: AppHandle, state: tauri::State<'_, Arc<Mutex<IslandTrackerState>>>) {
    apply_expanded(&app, state.inner(), true);
}

#[tauri::command]
pub fn island_collapse(app: AppHandle, state: tauri::State<'_, Arc<Mutex<IslandTrackerState>>>) {
    let locked = state.lock().locked;
    if locked {
        return;
    }
    apply_expanded(&app, state.inner(), false);
}
