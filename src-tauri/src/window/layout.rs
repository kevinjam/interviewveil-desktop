use serde_json::json;
use tauri::{AppHandle, LogicalSize, Monitor, PhysicalPosition, WebviewWindow};
use tauri_plugin_store::StoreExt;

pub const PILL_MIN_W: u32 = 260;
pub const PILL_MAX_W: u32 = 660;
pub const PILL_H: i32 = 38;
pub const ISLAND_PANEL_W: i32 = 460;
pub const PANEL_MAX_H: i32 = 460;
pub const COLLAPSED_MARGIN: i32 = 10;
pub const STRIP_SPACE: i32 = 110;
pub const ISLAND_PAD_X: i32 = 130;
pub const ISLAND_W: u32 = (ISLAND_PANEL_W + ISLAND_PAD_X * 2) as u32;
pub const ISLAND_H: u32 = (PANEL_MAX_H + STRIP_SPACE + 40) as u32;
/// Physical-pixel inset used when snapping the chat panel to a display edge.
pub const CHAT_SNAP_PADDING: i32 = 20;
/// Logical px — same range as Tech Screen (`CHAT_MIN_HEIGHT` / `CHAT_MAX_HEIGHT`).
pub const CHAT_MIN_HEIGHT: f64 = 160.0;
pub const CHAT_MAX_HEIGHT: f64 = 620.0;
pub const CHAT_MIN_WIDTH: f64 = 520.0;

pub fn clamp_chat_height(height: f64) -> f64 {
    height.round().clamp(CHAT_MIN_HEIGHT, CHAT_MAX_HEIGHT)
}

const WINDOW_STORE: &str = "window.json";
const CHAT_BOUNDS_KEY: &str = "chatBounds";

pub fn island_window_size() -> LogicalSize<f64> {
    LogicalSize::new(ISLAND_W as f64, ISLAND_H as f64)
}

pub fn place_card_center(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let work = monitor.work_area();
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let x = work.position.x + ((work.size.width - size.width) as i32 / 2);
    let y = work.position.y + ((work.size.height - size.height) as i32 / 2);
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn place_island_top_center(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let work = monitor.work_area();
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let x = work.position.x + ((work.size.width - size.width) as i32 / 2);
    let y = work.position.y + COLLAPSED_MARGIN;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn place_chat_upper_right(window: &WebviewWindow) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let work = monitor.work_area();
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let margin = 16i32;
    let x = work.position.x + (work.size.width - size.width) as i32 - margin;
    let y = work.position.y + 48;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Restore a previously saved chat position, clamped to the nearest work area.
/// Returns `Ok(false)` when nothing is stored so the caller can use first-run placement.
pub fn restore_chat_position(app: &AppHandle, window: &WebviewWindow) -> Result<bool, String> {
    let store = app.store(WINDOW_STORE).map_err(|e| e.to_string())?;
    let Some(value) = store.get(CHAT_BOUNDS_KEY) else {
        return Ok(false);
    };
    let Some(x) = json_i32(value.get("x")) else {
        return Ok(false);
    };
    let Some(y) = json_i32(value.get("y")) else {
        return Ok(false);
    };
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y) = clamp_to_work_area(window, x, y, size.width, size.height)?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn save_chat_position(app: &AppHandle, x: i32, y: i32) -> Result<(), String> {
    let store = app.store(WINDOW_STORE).map_err(|e| e.to_string())?;
    store.set(CHAT_BOUNDS_KEY, json!({ "x": x, "y": y }));
    Ok(())
}

/// Snap the chat window to the left (`direction < 0`) or right edge of its
/// current display, keeping Y and clamping it into the work area.
pub fn snap_chat_to_edge(window: &WebviewWindow, direction: i32) -> Result<(), String> {
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let monitor = current_or_nearest_monitor(window, pos.x, pos.y)?;
    let work = monitor.work_area();
    let x = if direction < 0 {
        work.position.x + CHAT_SNAP_PADDING
    } else {
        work.position.x + work.size.width as i32 - size.width as i32 - CHAT_SNAP_PADDING
    };
    let (x, y) = clamp_point(
        x,
        pos.y,
        size.width,
        size.height,
        work.position.x,
        work.position.y,
        work.size.width,
        work.size.height,
    );
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

fn clamp_to_work_area(
    window: &WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(i32, i32), String> {
    let monitor = nearest_or_current_monitor(window, x, y)?;
    let work = monitor.work_area();
    Ok(clamp_point(
        x,
        y,
        width,
        height,
        work.position.x,
        work.position.y,
        work.size.width,
        work.size.height,
    ))
}

fn current_or_nearest_monitor(window: &WebviewWindow, x: i32, y: i32) -> Result<Monitor, String> {
    if let Ok(Some(monitor)) = window.current_monitor() {
        return Ok(monitor);
    }
    nearest_or_current_monitor(window, x, y)
}

fn nearest_or_current_monitor(window: &WebviewWindow, x: i32, y: i32) -> Result<Monitor, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    if let Some(monitor) = nearest_monitor(&monitors, x, y) {
        return Ok(monitor.clone());
    }
    window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())
}

fn nearest_monitor(monitors: &[Monitor], x: i32, y: i32) -> Option<&Monitor> {
    monitors.iter().min_by_key(|monitor| {
        let work = monitor.work_area();
        let left = work.position.x;
        let top = work.position.y;
        let right = left + work.size.width as i32;
        let bottom = top + work.size.height as i32;
        let dx = if x < left {
            left - x
        } else if x >= right {
            x - (right - 1)
        } else {
            0
        };
        let dy = if y < top {
            top - y
        } else if y >= bottom {
            y - (bottom - 1)
        } else {
            0
        };
        (dx as i64) * (dx as i64) + (dy as i64) * (dy as i64)
    })
}

fn clamp_point(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    work_x: i32,
    work_y: i32,
    work_w: u32,
    work_h: u32,
) -> (i32, i32) {
    let min_x = work_x;
    let max_x = work_x + work_w as i32 - width as i32;
    let min_y = work_y;
    let max_y = work_y + work_h as i32 - height as i32;
    (x.clamp(min_x, max_x.max(min_x)), y.clamp(min_y, max_y.max(min_y)))
}

fn json_i32(value: Option<&serde_json::Value>) -> Option<i32> {
    let value = value?;
    value
        .as_i64()
        .map(|n| n as i32)
        .or_else(|| value.as_u64().map(|n| n as i32))
        .or_else(|| value.as_f64().map(|n| n as i32))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_keeps_window_inside_work_area() {
        let (x, y) = clamp_point(0, 0, 200, 100, 100, 50, 800, 600);
        assert_eq!((x, y), (100, 50));
        let (x, y) = clamp_point(900, 700, 200, 100, 100, 50, 800, 600);
        assert_eq!((x, y), (700, 550));
    }

    #[test]
    fn snap_padding_matches_tech_screen() {
        assert_eq!(CHAT_SNAP_PADDING, 20);
    }

    #[test]
    fn chat_height_clamps_like_tech_screen() {
        assert_eq!(clamp_chat_height(80.0), CHAT_MIN_HEIGHT);
        assert_eq!(clamp_chat_height(186.0), 186.0);
        assert_eq!(clamp_chat_height(900.0), CHAT_MAX_HEIGHT);
    }
}
