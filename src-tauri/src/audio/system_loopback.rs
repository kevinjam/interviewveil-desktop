//! System / meeting audio capture (loopback).
//!
//! - macOS: ScreenCaptureKit display audio (Screen Recording permission), with
//!   optional fallback to virtual loopback devices (BlackHole, etc.)
//! - Windows / other: named loopback / virtual input devices when present
//! - Failures here must not block microphone recording — callers treat this as best-effort.

use super::{CaptureHandle, SampleBlock};
use crate::audio::microphone;
use std::sync::mpsc::Sender;

#[cfg(target_os = "macos")]
use super::macos_sck;

fn looks_like_loopback(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.contains("stereo mix")
        || n.contains("what u hear")
        || n.contains("wave out mix")
        || n.contains("loopback")
        || n.contains("blackhole")
        || n.contains("soundflower")
        || n.contains("multi-output")
        || n.contains("aggregate")
        || n.contains("cable output")
        || n.contains("vb-audio")
}

/// Probe whether system-audio capture is likely available (diagnostic only).
///
/// On macOS we do not call ScreenCaptureKit here: `SCShareableContent::get()` is
/// gated on Screen Recording and would look "unavailable" until the user starts
/// a session and grants it. The SCK path is compiled in, so treat it as ready.
pub fn probe() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        use cpal::traits::{DeviceTrait, HostTrait};
        let host = cpal::default_host();
        for device in host.input_devices().map_err(|e| e.to_string())? {
            if let Ok(name) = device.name() {
                if looks_like_loopback(&name) {
                    device.default_input_config().map_err(|e| e.to_string())?;
                    return Ok(());
                }
            }
        }
        Err("no system-audio input found (enable Stereo Mix, or install a loopback device)".into())
    }
}

/// Start capturing system/output audio into `tx`.
pub fn start(tx: Sender<SampleBlock>) -> Result<CaptureHandle, String> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(handle) = macos_sck::start(tx.clone()) {
            return Ok(handle);
        }
    }
    microphone::start_matching(tx, "system-audio", looks_like_loopback)
}
