import { hotkeyParts } from "@/lib/hotkeys";

/** `CommandOrControl+2` → `⌘ 2` for compact display. */
export function formatHotkeyLabel(raw: string): string {
  return hotkeyParts(raw).join(" ") || "—";
}
