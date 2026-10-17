//! Short, user-facing copy. Technical errors are logged with `eprintln!` only.

pub fn is_screen_permission_error(lowered: &str) -> bool {
    lowered.contains("tcc")
        || lowered.contains("declined")
        || lowered.contains("permission")
        || lowered.contains("not authorized")
        || lowered.contains("denied")
        || lowered.contains("content unavailable")
        || lowered.contains("shareable content")
}

/// Shown when ScreenCaptureKit / screen capture is blocked.
pub fn screen_recording_user_message() -> String {
    if cfg!(debug_assertions) {
        "Screen recording is off. In System Settings → Privacy & Security → Screen Recording, turn on InterviewVeil—or Terminal/Cursor if you're running from the dev build—then quit and reopen the app.".into()
    } else {
        "Screen recording is off. Turn on InterviewVeil in System Settings → Privacy & Security → Screen Recording, then quit and reopen the app.".into()
    }
}

pub fn map_screen_capture_error(err: impl std::fmt::Display) -> String {
    let msg = err.to_string();
    let lowered = msg.to_lowercase();
    if is_screen_permission_error(&lowered) {
        eprintln!("InterviewVeil: screen capture permission: {msg}");
        screen_recording_user_message()
    } else {
        eprintln!("InterviewVeil: screen capture failed: {msg}");
        "Couldn't capture the screen. Try again.".into()
    }
}
