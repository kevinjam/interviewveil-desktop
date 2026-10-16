//! Global shortcuts (work while InterviewVeil is hidden or unfocused).
//!
//! The frontend owns the user's bindings and sends them with `update_hotkeys`.
//! Window-level actions run natively here; everything else is emitted to the
//! webviews as a `hotkey` event (`{ action }`).

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// action id → accelerator (e.g. `CommandOrControl+Alt+Up`); empty = unbound.
pub type HotkeyConfig = BTreeMap<String, String>;

/// Every action a shortcut can trigger. Keep in sync with `src/lib/hotkeys.ts`.
pub const ACTIONS: &[(&str, &str)] = &[
    ("explain_screen", "CommandOrControl+2"),
    ("send_screenshots", "CommandOrControl+Enter"),
    ("record", "CommandOrControl+3"),
    ("clear_screenshots", "CommandOrControl+Alt+Backspace"),
    ("clear_chat", "CommandOrControl+Alt+K"),
    ("new_question", "CommandOrControl+4"),
    ("submit_answer", "CommandOrControl+5"),
    ("scroll_up", "CommandOrControl+Alt+Up"),
    ("scroll_down", "CommandOrControl+Alt+Down"),
    ("toggle_visibility", "CommandOrControl+1"),
    ("toggle_interactability", "CommandOrControl+9"),
    ("move_chat_left", "CommandOrControl+Left"),
    ("move_chat_right", "CommandOrControl+Right"),
    ("quit", "CommandOrControl+Alt+Q"),
];

pub fn default_config() -> HotkeyConfig {
    ACTIONS
        .iter()
        .map(|(a, k)| (a.to_string(), k.to_string()))
        .collect()
}

/// The bindings last applied, so they can be restored after a pause.
#[derive(Default)]
pub struct HotkeyState(Mutex<HotkeyConfig>);

#[derive(Debug, Clone, Serialize)]
pub struct HotkeyIssue {
    pub action: String,
    pub message: String,
}

fn run_action(app: &AppHandle, action: &str) {
    let result = match action {
        "toggle_visibility" => crate::window::toggle_window_visibility(app.clone()).map(|_| ()),
        "toggle_interactability" => {
            crate::window::toggle_interactability(app);
            Ok(())
        }
        "move_chat_left" => crate::window::nudge_chat(app, -1),
        "move_chat_right" => crate::window::nudge_chat(app, 1),
        "quit" => {
            app.exit(0);
            Ok(())
        }
        _ => app
            .emit("hotkey", serde_json::json!({ "action": action }))
            .map_err(|e| e.to_string()),
    };
    if let Err(e) = result {
        eprintln!("InterviewVeil: shortcut '{action}' failed: {e}");
    }
}

/// Replace all registered shortcuts with `config`. Returns one issue per
/// binding that could not be applied (unknown key, duplicate, taken by the OS).
pub fn register_hotkeys(app: &AppHandle, config: &HotkeyConfig) -> Vec<HotkeyIssue> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let mut issues = Vec::new();
    let mut seen: HashMap<u32, String> = HashMap::new();

    for (action, accelerator) in config {
        if !ACTIONS.iter().any(|(a, _)| a == action) {
            continue; // ignore stale actions from older settings
        }
        if accelerator.trim().is_empty() {
            continue; // unbound
        }
        let shortcut: Shortcut = match accelerator.parse() {
            Ok(s) => s,
            Err(e) => {
                issues.push(HotkeyIssue {
                    action: action.clone(),
                    message: format!("Unsupported shortcut ({e})"),
                });
                continue;
            }
        };
        if let Some(other) = seen.get(&shortcut.id()) {
            issues.push(HotkeyIssue {
                action: action.clone(),
                message: format!("Same keys as {other}"),
            });
            continue;
        }
        seen.insert(shortcut.id(), action.clone());

        let action_id = action.clone();
        let result = gs.on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                run_action(app, &action_id);
            }
        });
        if let Err(e) = result {
            issues.push(HotkeyIssue {
                action: action.clone(),
                message: format!("Couldn't register — another app may be using it ({e})"),
            });
        }
    }

    *app.state::<HotkeyState>().0.lock() = config.clone();
    issues
}

/// Remember bindings even before the overlay is up; only register them while it is.
#[tauri::command]
pub fn update_hotkeys(app: AppHandle, config: HotkeyConfig) -> Vec<HotkeyIssue> {
    if !crate::window::overlay_active(&app) {
        *app.state::<HotkeyState>().0.lock() = config;
        return Vec::new();
    }
    register_hotkeys(&app, &config)
}

pub fn activate_overlay_hotkeys(app: &AppHandle) {
    let config = {
        let saved = app.state::<HotkeyState>().0.lock().clone();
        if saved.is_empty() {
            default_config()
        } else {
            saved
        }
    };
    for issue in register_hotkeys(app, &config) {
        eprintln!(
            "InterviewVeil: shortcut '{}' not registered: {}",
            issue.action, issue.message
        );
    }
}

/// Temporarily release every shortcut (while the user records a new one).
#[tauri::command]
pub fn suspend_hotkeys(app: AppHandle) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}

/// Re-register the last applied bindings after `suspend_hotkeys`.
#[tauri::command]
pub fn resume_hotkeys(app: AppHandle) -> Vec<HotkeyIssue> {
    if !crate::window::overlay_active(&app) {
        return Vec::new();
    }
    let config = app.state::<HotkeyState>().0.lock().clone();
    register_hotkeys(&app, &config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shortcuts_parse_and_are_unique() {
        let mut ids = std::collections::HashSet::new();
        for (action, accel) in ACTIONS {
            let s: Shortcut = accel.parse().unwrap_or_else(|e| panic!("{action}: {accel}: {e}"));
            assert!(ids.insert(s.id()), "duplicate default for {action}");
        }
    }

    #[test]
    fn frontend_accelerator_formats_parse() {
        for accel in [
            "CommandOrControl+Shift+A",
            "Control+Alt+F5",
            "CommandOrControl+[",
            "CommandOrControl+/",
            "Alt+Space",
            "CommandOrControl+Enter",
            "CommandOrControl+9",
            "CommandOrControl+Left",
            "CommandOrControl+Right",
            "Super+Delete",
            "F9",
        ] {
            assert!(accel.parse::<Shortcut>().is_ok(), "{accel}");
        }
    }
}
