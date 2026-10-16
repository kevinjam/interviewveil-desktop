/** Shortcut actions. Keep ids and defaults in sync with `src-tauri/src/hotkeys/mod.rs`. */
export const HOTKEY_ACTIONS = [
  { id: "explain_screen", label: "Capture screenshot", group: "Assist", default: "CommandOrControl+2" },
  { id: "send_screenshots", label: "Send to AI", group: "Assist", default: "CommandOrControl+Enter" },
  { id: "record", label: "Listen", group: "Assist", default: "CommandOrControl+3" },
  { id: "clear_screenshots", label: "Clear screenshots", group: "Assist", default: "CommandOrControl+Alt+Backspace" },
  { id: "clear_chat", label: "Clear answers", group: "Assist", default: "CommandOrControl+Alt+K" },
  { id: "new_question", label: "New question", group: "Practice", default: "CommandOrControl+4" },
  { id: "submit_answer", label: "Get feedback", group: "Practice", default: "CommandOrControl+5" },
  { id: "scroll_up", label: "Scroll up", group: "Chat", default: "CommandOrControl+Alt+Up" },
  { id: "scroll_down", label: "Scroll down", group: "Chat", default: "CommandOrControl+Alt+Down" },
  { id: "toggle_visibility", label: "Hide / show", group: "Window", default: "CommandOrControl+1" },
  { id: "toggle_interactability", label: "Click-through", group: "Window", default: "CommandOrControl+9" },
  { id: "move_chat_left", label: "Move chat left", group: "Window", default: "CommandOrControl+Left" },
  { id: "move_chat_right", label: "Move chat right", group: "Window", default: "CommandOrControl+Right" },
  { id: "quit", label: "Quit", group: "Window", default: "CommandOrControl+Alt+Q" },
] as const;

export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number]["id"];

/** action → accelerator ("" = unbound). */
export type HotkeySettings = Record<HotkeyAction, string>;

export const DEFAULT_HOTKEYS = Object.fromEntries(
  HOTKEY_ACTIONS.map((a) => [a.id, a.default]),
) as HotkeySettings;

export const HOTKEY_GROUPS = ["Assist", "Practice", "Chat", "Window"] as const;

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);

/** `KeyboardEvent.code` → accelerator key name understood by the native parser. */
const CODE_KEYS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backspace: "Backspace",
  Delete: "Delete",
  Enter: "Enter",
  Space: "Space",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  BracketLeft: "[",
  BracketRight: "]",
  Slash: "/",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return CODE_KEYS[code] ?? null;
}

export type CaptureResult =
  | { kind: "pending" } // only modifiers held so far
  | { kind: "cancel" }
  | { kind: "clear" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; accelerator: string };

/** Turn a keydown into an accelerator like `CommandOrControl+Alt+Up`. */
export function acceleratorFromEvent(e: KeyboardEvent): CaptureResult {
  const mods: string[] = [];
  if (isMac) {
    if (e.metaKey) mods.push("CommandOrControl");
    if (e.ctrlKey) mods.push("Control");
  } else {
    if (e.ctrlKey) mods.push("CommandOrControl");
    if (e.metaKey) mods.push("Super");
  }
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  if (["Meta", "Control", "Alt", "Shift", "OS"].includes(e.key)) return { kind: "pending" };
  if (e.code === "Escape" && mods.length === 0) return { kind: "cancel" };
  if ((e.code === "Backspace" || e.code === "Delete") && mods.length === 0) return { kind: "clear" };

  const key = keyFromCode(e.code);
  if (!key) return { kind: "invalid", message: "That key can't be used in a shortcut." };
  const fnKey = /^F\d+$/.test(key);
  if (mods.length === 0 && !fnKey) {
    return { kind: "invalid", message: `Add a modifier (${isMac ? "⌘ ⌥ ⌃ ⇧" : "Ctrl Alt Shift"}).` };
  }
  if (mods.length === 1 && mods[0] === "Shift" && !fnKey) {
    return { kind: "invalid", message: "Shift alone would block typing — add another modifier." };
  }
  return { kind: "ok", accelerator: [...mods, key].join("+") };
}

const KEY_SYMBOLS: Record<string, string> = {
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Backspace: "⌫",
  Delete: "⌦",
  Enter: "↩",
  Return: "↩",
  Space: "Space",
  Tab: "⇥",
};

/** `CommandOrControl+Alt+Up` → ["⌘", "⌥", "↑"] (or Ctrl/Alt names off macOS). */
export function hotkeyParts(accelerator: string): string[] {
  if (!accelerator) return [];
  const parts = accelerator.split("+").filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = parts.map((m) => {
    switch (m.toLowerCase()) {
      case "commandorcontrol":
      case "cmdorctrl":
      case "command":
      case "cmd":
        return isMac ? "⌘" : "Ctrl";
      case "control":
      case "ctrl":
        return isMac ? "⌃" : "Ctrl";
      case "alt":
      case "option":
        return isMac ? "⌥" : "Alt";
      case "shift":
        return isMac ? "⇧" : "Shift";
      case "super":
        return "Win";
      default:
        return m;
    }
  });
  return [...mods, KEY_SYMBOLS[key] ?? key.toUpperCase()];
}
