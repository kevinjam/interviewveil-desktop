//! Screen Recording + microphone status, matching Tech Screen's setup gate.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)] // Denied / NotDetermined are returned to the UI and via serde
pub enum PermissionState {
    Granted,
    Denied,
    #[serde(rename = "not-determined")]
    NotDetermined,
}

#[derive(Debug, Clone, Serialize)]
pub struct PermissionStatus {
    pub screen: PermissionState,
    pub microphone: PermissionState,
}

pub fn status() -> PermissionStatus {
    PermissionStatus {
        screen: screen_status(),
        microphone: microphone_status(),
    }
}

pub fn needs_setup() -> bool {
    let s = status();
    #[cfg(all(target_os = "macos", debug_assertions))]
    {
        // `tauri dev` runs a debug binary; macOS Screen Recording TCC often
        // never reports granted. Don't trap login on that card. Mic still works.
        let _ = s.screen;
        return !matches!(s.microphone, PermissionState::Granted);
    }
    #[cfg(all(target_os = "macos", not(debug_assertions)))]
    {
        !matches!(s.screen, PermissionState::Granted)
            || !matches!(s.microphone, PermissionState::Granted)
    }
    #[cfg(not(target_os = "macos"))]
    {
        matches!(s.microphone, PermissionState::Denied)
    }
}

#[cfg(target_os = "macos")]
fn screen_status() -> PermissionState {
    unsafe {
        if CGPreflightScreenCaptureAccess() {
            PermissionState::Granted
        } else {
            PermissionState::Denied
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn screen_status() -> PermissionState {
    PermissionState::Granted
}

#[cfg(target_os = "macos")]
fn microphone_status() -> PermissionState {
    macos_mic_status()
}

#[cfg(not(target_os = "macos"))]
fn microphone_status() -> PermissionState {
    PermissionState::Granted
}

/// Tech Screen `desktopCapturer.getSources({ types: ["screen"] })`: a real
/// capture probe so macOS adds this process to Screen Recording.
pub fn request_screen() -> PermissionState {
    #[cfg(target_os = "macos")]
    prime_screen_permission();
    screen_status()
}

pub fn request_microphone() -> PermissionState {
    #[cfg(target_os = "macos")]
    macos_request_microphone();
    microphone_status()
}

pub fn open_settings(app: &AppHandle, pane: &str) -> Result<(), String> {
    super::lower_gate_windows(app);
    #[cfg(target_os = "macos")]
    {
        if pane != "microphone" {
            prime_screen_permission();
        }
        let section = if pane == "microphone" {
            "Privacy_Microphone"
        } else {
            "Privacy_ScreenCapture"
        };
        // Same URL Electron `shell.openExternal` uses in Tech Screen.
        let url = format!(
            "x-apple.systempreferences:com.apple.preference.security?{section}"
        );
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(open_url_macos(&url));
        })
        .map_err(|e| e.to_string())?;
        return rx.recv().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        if pane == "microphone" {
            std::process::Command::new("cmd")
                .args(["/C", "start", "ms-settings:privacy-microphone"])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = pane;
        Ok(())
    }
}

/// ScreenCaptureKit `SCShareableContent::get()` is the same probe Electron
/// `desktopCapturer.getSources` uses. Run off the main thread so a TCC prompt
/// cannot freeze the permissions card.
#[cfg(target_os = "macos")]
fn prime_screen_permission() {
    unsafe {
        let _ = CGRequestScreenCaptureAccess();
    }
    let _ = std::thread::spawn(|| {
        crate::capture::prime_screen_capture();
    })
    .join();
}

/// Electron `shell.openExternal` — NSWorkspace, not `/usr/bin/open`.
#[cfg(target_os = "macos")]
fn open_url_macos(url: &str) -> Result<(), String> {
    use objc2::msg_send;
    use objc2::runtime::{AnyObject, Bool};

    let c_url = std::ffi::CString::new(url).map_err(|e| e.to_string())?;
    unsafe {
        let ns_str: *mut AnyObject = msg_send![
            objc2::class!(NSString),
            stringWithUTF8String: c_url.as_ptr()
        ];
        if ns_str.is_null() {
            return Err("could not build settings URL".into());
        }
        let nsurl: *mut AnyObject = msg_send![objc2::class!(NSURL), URLWithString: ns_str];
        if nsurl.is_null() {
            return Err("could not build settings URL".into());
        }
        let workspace: *mut AnyObject = msg_send![objc2::class!(NSWorkspace), sharedWorkspace];
        let ok: Bool = msg_send![workspace, openURL: nsurl];
        if ok.as_bool() {
            Ok(())
        } else {
            Err("System Settings did not open".into())
        }
    }
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
#[link(name = "AppKit", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
#[link(name = "AVFoundation", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
fn av_media_audio() -> *mut objc2::runtime::AnyObject {
    use objc2::msg_send;
    unsafe {
        msg_send![
            objc2::class!(NSString),
            stringWithUTF8String: b"soun\0".as_ptr()
        ]
    }
}

#[cfg(target_os = "macos")]
fn macos_mic_status() -> PermissionState {
    use objc2::msg_send;
    unsafe {
        let status: i64 = msg_send![
            objc2::class!(AVCaptureDevice),
            authorizationStatusForMediaType: av_media_audio()
        ];
        match status {
            3 => PermissionState::Granted,
            2 | 1 => PermissionState::Denied,
            _ => PermissionState::NotDetermined,
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_request_microphone() {
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::Bool;

    let block = RcBlock::new(|_granted: Bool| {});
    unsafe {
        let _: () = msg_send![
            objc2::class!(AVCaptureDevice),
            requestAccessForMediaType: av_media_audio(),
            completionHandler: &*block
        ];
    }
    std::mem::forget(block);
}

#[tauri::command]
pub fn permissions_status() -> PermissionStatus {
    status()
}

#[tauri::command]
pub fn permissions_request_screen(app: AppHandle) -> PermissionStatus {
    super::lower_gate_windows(&app);
    let _ = request_screen();
    status()
}

#[tauri::command]
pub fn permissions_request_microphone(app: AppHandle) -> PermissionStatus {
    super::lower_gate_windows(&app);
    let _ = request_microphone();
    status()
}

#[tauri::command]
pub fn permissions_open_settings(app: AppHandle, pane: String) -> Result<(), String> {
    open_settings(&app, &pane)
}

#[tauri::command]
pub fn permissions_needs_setup() -> bool {
    needs_setup()
}
