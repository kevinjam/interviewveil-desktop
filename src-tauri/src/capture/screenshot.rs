//! Screen capture — Tech Screen style:
//! - macOS: ScreenCaptureKit still frame (real window contents, not wallpaper)
//! - Cap at 1920×1080
//! - Persist JPEG to disk; return only a tiny thumbnail over IPC
//! - Encode full JPEG for AI only when sending

use base64::{engine::general_purpose::STANDARD, Engine};
use image::buffer::ConvertBuffer;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{RgbImage, RgbaImage};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const MAX_WIDTH: u32 = 1920;
const MAX_HEIGHT: u32 = 1080;
const JPEG_QUALITY: u8 = 80;
const THUMB_WIDTH: u32 = 220;
const THUMB_QUALITY: u8 = 60;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotResult {
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub thumb_base64: String,
    pub thumb_mime: &'static str,
    pub file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotPayload {
    pub data_base64: String,
    pub mime: &'static str,
}

fn screenshot_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand = (ms % 1_000_000) as u32;
    format!("{ms}_{rand:x}")
}

fn fit_max(image: RgbaImage) -> RgbaImage {
    let (w, h) = (image.width(), image.height());
    if w <= MAX_WIDTH && h <= MAX_HEIGHT {
        return image;
    }
    let aspect = w as f32 / h as f32;
    let max_aspect = MAX_WIDTH as f32 / MAX_HEIGHT as f32;
    let (nw, nh) = if aspect > max_aspect {
        (MAX_WIDTH, (MAX_WIDTH as f32 / aspect).round() as u32)
    } else {
        ((MAX_HEIGHT as f32 * aspect).round() as u32, MAX_HEIGHT)
    };
    image::imageops::resize(&image, nw.max(1), nh.max(1), FilterType::Triangle)
}

fn encode_jpeg(rgba: &RgbaImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb: RgbImage = rgba.convert();
    let mut buf = Vec::with_capacity((rgb.width() * rgb.height()) as usize);
    let mut encoder = JpegEncoder::new_with_quality(&mut buf, quality);
    encoder
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

fn make_thumb(rgba: &RgbaImage) -> Result<Vec<u8>, String> {
    let (w, h) = (rgba.width(), rgba.height());
    if w == 0 || h == 0 {
        return Err("empty capture".into());
    }
    let thumb_h = ((THUMB_WIDTH as f32) / (w as f32 / h as f32)).round() as u32;
    let thumb = image::imageops::resize(rgba, THUMB_WIDTH, thumb_h.max(1), FilterType::Triangle);
    encode_jpeg(&thumb, THUMB_QUALITY)
}

fn screenshots_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resolve("screenshots", tauri::path::BaseDirectory::AppData)
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn finish(app: &AppHandle, started: std::time::Instant, rgba: RgbaImage) -> Result<ScreenshotResult, String> {
    let rgba = fit_max(rgba);
    let width = rgba.width();
    let height = rgba.height();
    let jpeg = encode_jpeg(&rgba, JPEG_QUALITY)?;
    let thumb = make_thumb(&rgba)?;
    let id = screenshot_id();
    let file_path = screenshots_dir(app)?.join(format!("screenshot_{id}.jpg"));
    std::fs::write(&file_path, &jpeg).map_err(|e| e.to_string())?;

    eprintln!(
        "InterviewVeil: screenshot {}×{} in {}ms (file {} KB, thumb {} KB)",
        width,
        height,
        started.elapsed().as_millis(),
        jpeg.len() / 1024,
        thumb.len() / 1024
    );

    Ok(ScreenshotResult {
        id,
        width,
        height,
        thumb_base64: STANDARD.encode(&thumb),
        thumb_mime: "image/jpeg",
        file_path: file_path.to_string_lossy().to_string(),
    })
}

#[cfg(target_os = "macos")]
pub fn capture_screen(app: &AppHandle) -> Result<ScreenshotResult, String> {
    let started = std::time::Instant::now();
    let rgba = super::macos_sck::capture_rgba(app)?;
    finish(app, started, rgba)
}

#[cfg(not(target_os = "macos"))]
pub fn capture_screen(app: &AppHandle) -> Result<ScreenshotResult, String> {
    use screenshots::Screen;

    let started = std::time::Instant::now();
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .into_iter()
        .find(|s| s.display_info.is_primary)
        .or_else(|| Screen::all().ok().and_then(|s| s.into_iter().next()))
        .ok_or_else(|| "no monitors found".to_string())?;
    let captured = screen.capture().map_err(|e| e.to_string())?;
    let rgba = RgbaImage::from_raw(captured.width(), captured.height(), captured.into_raw())
        .ok_or_else(|| "invalid capture buffer".to_string())?;
    finish(app, started, rgba)
}

pub fn read_for_ai(paths: &[String]) -> Result<Vec<ScreenshotPayload>, String> {
    let mut out = Vec::with_capacity(paths.len());
    for path in paths {
        let bytes = std::fs::read(path).map_err(|e| format!("read {path}: {e}"))?;
        out.push(ScreenshotPayload {
            data_base64: STANDARD.encode(&bytes),
            mime: "image/jpeg",
        });
    }
    Ok(out)
}

pub fn delete_files(paths: &[String]) {
    for path in paths {
        let p = Path::new(path);
        if p.exists() {
            let _ = std::fs::remove_file(p);
        }
    }
}
