import { formatHotkeyLabel } from "@/lib/formatHotkey";

interface Props {
  accelerator: string;
  label: string;
  className?: string;
}

/** Shortcut chip (kbd + verb). */
export function HotkeyChip({ accelerator, label, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 pl-1.5 pr-2.5 rounded-full bg-[var(--panel-2)] border border-transparent ${className}`}
    >
      <kbd className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded-[7px] bg-[var(--panel)] text-[10px] font-semibold text-[var(--text)] tabular-nums border-0">
        {formatHotkeyLabel(accelerator)}
      </kbd>
      <span className="text-[11px] font-semibold text-[var(--muted)] capitalize">
        {label}
      </span>
    </span>
  );
}
