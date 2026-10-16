import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { HotkeyAction } from "@/lib/hotkeys";

/** Actions the chat window handles (window-level ones run natively in Rust). */
export type AppActionHandlers = Partial<Record<HotkeyAction, () => void>>;

/** Routes global shortcuts (`hotkey`) and island menu clicks (`app-action`) to handlers. */
export function useAppActions(handlers: AppActionHandlers) {
  // Keep the latest handlers without re-subscribing on every render.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const route = (action: string) => ref.current[action as HotkeyAction]?.();
    const unlisteners = [
      listen<{ action: string }>("hotkey", (e) => route(e.payload.action)),
      listen<string>("app-action", (e) => route(e.payload)),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, []);
}
