//! Single-frame screenshot via ScreenCaptureKit (same family as Electron `desktopCapturer`).
//!
//! Must run on the AppKit main thread. `tauri dev` must launch InterviewVeil.app
//! through Launch Services; otherwise TCC follows Cursor/Terminal and SCK fails.

use image::RgbaImage;
use screencapturekit::prelude::*;
use screencapturekit::screenshot_manager::{CGImageExt, SCScreenshotManager};
use std::sync::mpsc;
use tauri::AppHandle;

const MAX_WIDTH: u32 = 1920;
const MAX_HEIGHT: u32 = 1080;
const IV_BUNDLE: &str = "com.interviewveil.desktop";

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGRequestScreenCaptureAccess() -> bool;
    fn CGPreflightScreenCaptureAccess() -> bool;
}

/// Registers this process with TCC using the same API we capture with.
pub fn prime() {
    unsafe {
        let _ = CGRequestScreenCaptureAccess();
    }
    let _ = shareable_content();
}

fn shareable_content() -> Result<SCShareableContent, SCError> {
    // Match Electron desktopCapturer: on-screen windows, keep desktop windows.
    let first = SCShareableContent::create()
        .with_exclude_desktop_windows(false)
        .with_on_screen_windows_only(true)
        .get();
    if first.is_ok() {
        return first;
    }
    SCShareableContent::create()
        .with_exclude_desktop_windows(true)
        .with_on_screen_windows_only(false)
        .get()
        .or(first)
}

fn cursor_point() -> Option<(f64, f64)> {
    let (x, y) = readmouse::Mouse::location();
    Some((x, y))
}

fn display_contains(display: &SCDisplay, x: f64, y: f64) -> bool {
    let f = display.frame();
    x >= f.origin.x
        && x < f.origin.x + f.size.width
        && y >= f.origin.y
        && y < f.origin.y + f.size.height
}

fn pick_display(content: &SCShareableContent) -> Result<SCDisplay, String> {
    let displays = content.displays();
    if displays.is_empty() {
        return Err("no displays found".into());
    }

    if let Some((x, y)) = cursor_point() {
        if let Some(d) = displays.iter().find(|d| display_contains(d, x, y)) {
            eprintln!(
                "InterviewVeil: SCK display id={} {}×{} @({:.0},{:.0}) via cursor",
                d.display_id(),
                d.width(),
                d.height(),
                d.frame().origin.x,
                d.frame().origin.y
            );
            return Ok(d.clone());
        }
        eprintln!("InterviewVeil: SCK cursor at ({x:.0},{y:.0}) matched no display; using first");
    }

    let d = &displays[0];
    eprintln!(
        "InterviewVeil: SCK display id={} {}×{} via first",
        d.display_id(),
        d.width(),
        d.height()
    );
    Ok(d.clone())
}

fn iv_windows(content: &SCShareableContent) -> Vec<SCWindow> {
    content
        .windows()
        .into_iter()
        .filter(|w| {
            w.owning_application()
                .is_some_and(|app| app.bundle_identifier() == IV_BUNDLE)
        })
        .collect()
}

fn fit_output_size(display: &SCDisplay) -> (u32, u32) {
    let w = display.width().max(1);
    let h = display.height().max(1);
    if w <= MAX_WIDTH && h <= MAX_HEIGHT {
        return (w, h);
    }
    let aspect = w as f32 / h as f32;
    let max_aspect = MAX_WIDTH as f32 / MAX_HEIGHT as f32;
    if aspect > max_aspect {
        (MAX_WIDTH, ((MAX_WIDTH as f32) / aspect).round() as u32)
    } else {
        (((MAX_HEIGHT as f32) * aspect).round() as u32, MAX_HEIGHT)
    }
}

fn tcc_message(err: impl std::fmt::Display) -> String {
    crate::messages::map_screen_capture_error(err)
}

fn capture_rgba_on_main() -> Result<RgbaImage, String> {
    unsafe {
        let _ = CGRequestScreenCaptureAccess();
    }
    let exe = std::env::current_exe()
        .ok()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    let preflight = unsafe { CGPreflightScreenCaptureAccess() };
    eprintln!("InterviewVeil: exe={exe} CGPreflightScreenCaptureAccess={preflight}");

    let content = shareable_content().map_err(tcc_message)?;
    let display = pick_display(&content)?;
    let exclude = iv_windows(&content);
    let exclude_refs: Vec<&SCWindow> = exclude.iter().collect();
    let filter = SCContentFilter::create()
        .with_display(&display)
        .with_excluding_windows(&exclude_refs)
        .build()
        .map_err(|e| e.to_string())?;

    let (width, height) = fit_output_size(&display);
    let config = SCStreamConfiguration::new()
        .with_width(width)
        .with_height(height)
        .with_pixel_format(PixelFormat::BGRA)
        .with_shows_cursor(false);

    let image = SCScreenshotManager::capture_image(&filter, &config).map_err(tcc_message)?;

    let w = image.width() as u32;
    let h = image.height() as u32;
    if w == 0 || h == 0 {
        return Err("Screenshot returned an empty image.".into());
    }
    let rgba = image.rgba_data().map_err(|e| e.to_string())?;
    RgbaImage::from_raw(w, h, rgba).ok_or_else(|| "invalid ScreenCaptureKit buffer".into())
}

/// Capture the display under the mouse. ScreenCaptureKit must run on the main thread.
pub fn capture_rgba(app: &AppHandle) -> Result<RgbaImage, String> {
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(capture_rgba_on_main());
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}
