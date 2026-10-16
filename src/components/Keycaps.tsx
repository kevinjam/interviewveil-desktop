import { hotkeyParts } from "@/lib/hotkeys";

interface Props {
  accelerator: string;
  size?: "sm" | "md";
}

/** Renders `CommandOrControl+Alt+Up` as separate key caps: ⌘ ⌥ ↑ */
export function Keycaps({ accelerator, size = "md" }: Props) {
  const parts = hotkeyParts(accelerator);
  if (parts.length === 0) {
    return <span className="text-[11.5px] text-[var(--muted)] px-1">Not set</span>;
  }
  const cap =
    size === "sm"
      ? "min-w-[22px] h-[22px] px-1.5 text-[11px]"
      : "min-w-[26px] h-[26px] px-1.5 text-[12px]";
  return (
    <span className="inline-flex items-center gap-1" aria-label={parts.join(" ")}>
      {parts.map((p, i) => (
        <kbd
          key={i}
          className={`inline-flex items-center justify-center ${cap} rounded-[7px] border border-[var(--border)] bg-[var(--panel)] font-semibold text-[var(--text)] tabular-nums shadow-[inset_0_-1px_0_var(--border)]`}
        >
          {p}
        </kbd>
      ))}
    </span>
  );
}
