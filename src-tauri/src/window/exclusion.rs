//! Platform-specific screen capture exclusion for overlay windows.
//!
//! - macOS: `NSWindow.sharingType = .none` (blocks legacy capture APIs / many share tools)
//! - Windows: `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` (Win10 2004+)

use tauri::WebviewWindow;

#[cfg(target_os = "macos")]
mod macos {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSWindow, NSWindowSharingType};
    use tauri::WebviewWindow;

    pub fn exclude_from_capture(window: &WebviewWindow) -> Result<(), String> {
        let ns_ptr = window
            .ns_window()
            .map_err(|e| e.to_string())? as *mut NSWindow;

        unsafe {
            let ns_window = Retained::retain(ns_ptr).ok_or("invalid NSWindow")?;
            ns_window.setSharingType(NSWindowSharingType::None);
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use tauri::WebviewWindow;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    pub fn exclude_from_capture(window: &WebviewWindow) -> Result<(), String> {
        let hwnd = window
            .hwnd()
            .map_err(|e| e.to_string())?
            .0 as isize;
        let hwnd = HWND(hwnd as *mut _);

        if SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE).is_err() {
            return Err("SetWindowDisplayAffinity failed".to_string());
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback {
    use tauri::WebviewWindow;

    pub fn exclude_from_capture(_window: &WebviewWindow) -> Result<(), String> {
        Err("capture exclusion not supported on this platform".to_string())
    }
}

#[cfg(target_os = "macos")]
pub fn apply_capture_exclusion(window: &WebviewWindow) -> Result<(), String> {
    macos::exclude_from_capture(window)
}

#[cfg(target_os = "windows")]
pub fn apply_capture_exclusion(window: &WebviewWindow) -> Result<(), String> {
    windows::exclude_from_capture(window)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn apply_capture_exclusion(window: &WebviewWindow) -> Result<(), String> {
    fallback::exclude_from_capture(window)
}
