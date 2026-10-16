import { Camera, Mic, Send } from "lucide-react";
import { formatHotkeyLabel } from "@/lib/formatHotkey";
import type { HotkeySettings } from "@/stores/settingsStore";

interface Props {
  hotkeys: HotkeySettings;
  queued: number;
  onCapture: () => void;
  onSend: () => void;
  onListen: () => void;
}

/** Empty-state shortcut chips. */
export function ChatQuickActions({ hotkeys, queued, onCapture, onSend, onListen }: Props) {
  const items = [
    { id: "capture", label: "Capture", Icon: Camera, hotkey: hotkeys.explain_screen, onClick: onCapture },
    ...(queued > 0
      ? [{ id: "send", label: "Send", Icon: Send, hotkey: hotkeys.send_screenshots, onClick: onSend }]
      : []),
    { id: "listen", label: "Listen", Icon: Mic, hotkey: hotkeys.record, onClick: onListen },
  ] as const;

  return (
    <div className="flex items-center justify-center flex-wrap gap-1.5 w-full max-w-[420px]">
      {items.map(({ id, label, Icon, hotkey, onClick }) => (
        <button
          key={id}
          type="button"
          onClick={onClick}
          className="window-no-drag inline-flex items-center gap-1.5 h-[26px] pl-2.5 pr-1.5 rounded-full border border-[var(--border)] bg-[var(--panel-2)] text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
        >
          <Icon className="w-3 h-3 shrink-0 opacity-90" />
          {label}
          <kbd className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded-[7px] bg-[var(--panel)] text-[10px] font-semibold text-[var(--text)] tabular-nums border-0">
            {formatHotkeyLabel(hotkey)}
          </kbd>
        </button>
      ))}
    </div>
  );
}
