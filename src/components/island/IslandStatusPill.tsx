import type { RefObject } from "react";
import { PointerOff } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { HotkeyChip } from "@/components/HotkeyChip";
import { Keycaps } from "@/components/Keycaps";
import type { HotkeySettings } from "@/stores/settingsStore";

interface Props {
  recording: boolean;
  queued: number;
  hotkeys: HotkeySettings;
  interactable: boolean;
  pillRef: RefObject<HTMLDivElement | null>;
}

export function IslandStatusPill({
  recording,
  queued,
  hotkeys,
  interactable,
  pillRef,
}: Props) {
  const label = recording
    ? "Listening"
    : queued > 0
      ? `${queued} screenshot${queued === 1 ? "" : "s"} ready`
      : "Waiting for input";

  return (
    <div ref={pillRef} className="island-pill-inner window-no-drag">
      <div className="flex items-center gap-2 min-w-0">
        <BrandMark size={15} />
        <span
          className="island-activity"
          data-active={recording}
          data-ready={!recording}
        >
          <span />
        </span>
        <span className="text-[12.5px] font-medium tracking-tight text-[var(--text)] truncate">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!interactable && (
          <span className="island-clickthrough">
            <PointerOff className="w-3 h-3" strokeWidth={2.2} />
            Click-through
            <Keycaps accelerator={hotkeys.toggle_interactability} size="sm" />
          </span>
        )}
        {queued > 0 ? (
          <HotkeyChip accelerator={hotkeys.send_screenshots} label="send" />
        ) : (
          <HotkeyChip accelerator={hotkeys.explain_screen} label="capture" />
        )}
        <HotkeyChip accelerator={hotkeys.record} label="listen" />
      </div>
    </div>
  );
}
