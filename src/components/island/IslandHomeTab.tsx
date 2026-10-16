import { Camera, ChevronRight, Eye, Keyboard, Mic, Send, type LucideIcon } from "lucide-react";
import { Keycaps } from "@/components/Keycaps";
import type { HotkeyAction } from "@/lib/hotkeys";
import type { HotkeySettings } from "@/stores/settingsStore";

const ROWS: { action: HotkeyAction; icon: LucideIcon; title: string; sub: string }[] = [
  { action: "explain_screen", icon: Camera, title: "Capture screenshot", sub: "Grab the question on screen" },
  { action: "send_screenshots", icon: Send, title: "Send to AI", sub: "Analyze queued screenshots" },
  { action: "record", icon: Mic, title: "Listen", sub: "Hear the interviewer and answer" },
  { action: "toggle_visibility", icon: Eye, title: "Hide / show", sub: "Clear the screen" },
];

interface Props {
  hotkeys: HotkeySettings;
  onAction: (action: HotkeyAction) => void;
  onEditShortcuts: () => void;
}

export function IslandHomeTab({ hotkeys, onAction, onEditShortcuts }: Props) {
  return (
    <div className="p-3 space-y-2.5">
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)] overflow-hidden divide-y divide-[var(--border)]">
        {ROWS.map((row) => (
          <button
            key={row.action}
            type="button"
            onClick={() => onAction(row.action)}
            className="window-no-drag w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--hover)] transition-colors"
          >
            <span className="grid place-items-center w-9 h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel)]">
              <row.icon className="w-4 h-4 text-[var(--text)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold text-[var(--text)] leading-tight">
                {row.title}
              </span>
              <span className="block text-[11.5px] text-[var(--muted)] mt-0.5 truncate">{row.sub}</span>
            </span>
            <Keycaps accelerator={hotkeys[row.action]} />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onEditShortcuts}
        className="window-no-drag w-full flex items-center gap-2.5 px-3 h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)] text-left hover:bg-[var(--hover)] transition-colors"
      >
        <Keyboard className="w-4 h-4 text-[var(--muted)]" />
        <span className="flex-1 text-[13px] font-semibold">All shortcuts</span>
        <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
      </button>
    </div>
  );
}
