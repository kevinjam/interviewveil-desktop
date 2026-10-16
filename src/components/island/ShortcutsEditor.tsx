import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import {
  acceleratorFromEvent,
  DEFAULT_HOTKEYS,
  HOTKEY_ACTIONS,
  HOTKEY_GROUPS,
  isMac,
  type HotkeyAction,
  type HotkeySettings,
} from "@/lib/hotkeys";
import { Keycaps } from "@/components/Keycaps";
import { useSettingsStore } from "@/stores/settingsStore";

/** A binding the native layer couldn't apply (returned by `update_hotkeys`). */
export interface HotkeyIssue {
  action: string;
  message: string;
}

interface Props {
  onBack: () => void;
}

export function ShortcutsEditor({ onBack }: Props) {
  const hotkeys = useSettingsStore((s) => s.hotkeys);
  const setHotkeys = useSettingsStore((s) => s.setHotkeys);
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  /** Register bindings natively and collect per-action problems. */
  const apply = useCallback(async (next: HotkeySettings | null) => {
    try {
      const result = next
        ? await invoke<HotkeyIssue[]>("update_hotkeys", { config: next })
        : await invoke<HotkeyIssue[]>("resume_hotkeys");
      setIssues(Object.fromEntries(result.map((i) => [i.action, i.message])));
    } catch {
      setIssues({});
    }
  }, []);

  // Show problems with the current bindings when the page opens.
  useEffect(() => {
    void apply(null);
  }, [apply]);

  const stopRecording = useCallback(
    async (next: HotkeySettings | null) => {
      setRecording(null);
      setHint(null);
      invoke("island_set_locked", { locked: false }).catch(() => {});
      if (next) setHotkeys(next);
      await apply(next);
    },
    [apply, setHotkeys],
  );

  const startRecording = async (action: HotkeyAction) => {
    if (recording) return;
    setRecording(action);
    setHint("Press the new shortcut · Esc to cancel · ⌫ to clear");
    // Release global shortcuts so pressing an existing combo doesn't trigger it.
    await invoke("suspend_hotkeys").catch(() => {});
    invoke("island_set_locked", { locked: true }).catch(() => {});
    // The island must have keyboard focus to see the key presses.
    try {
      await getCurrentWindow().setFocus();
    } catch {
      // not fatal: the click usually focused it already
    }
  };

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const result = acceleratorFromEvent(e);
      switch (result.kind) {
        case "pending":
          return;
        case "cancel":
          void stopRecording(null);
          return;
        case "clear":
          void stopRecording({ ...hotkeys, [recording]: "" });
          return;
        case "invalid":
          setHint(result.message);
          return;
        case "ok": {
          const clash = HOTKEY_ACTIONS.find(
            (a) => a.id !== recording && hotkeys[a.id] === result.accelerator,
          );
          if (clash) {
            setHint(`Already used by “${clash.label}”. Try another combination.`);
            return;
          }
          void stopRecording({ ...hotkeys, [recording]: result.accelerator });
        }
      }
    };
    // Leaving the window mid-recording cancels, so shortcuts come back.
    const onBlur = () => void stopRecording(null);

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording, hotkeys, stopRecording]);

  // Never leave shortcuts suspended if the page closes mid-recording.
  useEffect(
    () => () => {
      invoke("resume_hotkeys").catch(() => {});
      invoke("island_set_locked", { locked: false }).catch(() => {});
    },
    [],
  );

  const reset = () => {
    setRecording(null);
    setHint(null);
    setHotkeys(DEFAULT_HOTKEYS);
    void apply(DEFAULT_HOTKEYS);
  };

  return (
    <div className="px-3 pt-3 pb-2">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center mb-2">
        <button
          type="button"
          onClick={onBack}
          className="window-no-drag justify-self-start inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel-2)] text-[12px] font-semibold hover:bg-[var(--hover)]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <h2 className="text-[11px] font-bold tracking-[0.08em] uppercase">Shortcuts</h2>
        <button
          type="button"
          onClick={reset}
          className="window-no-drag justify-self-end inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel-2)] text-[12px] font-semibold hover:bg-[var(--hover)]"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </header>

      <p className="text-[12px] text-[var(--muted)] px-0.5 mb-3" aria-live="polite">
        {hint ?? "Click a shortcut to change it"}
      </p>

      {HOTKEY_GROUPS.map((group) => (
        <section key={group} className="mb-3">
          <p className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-[var(--muted)] px-0.5 mb-1">
            {group}
          </p>
          <ul className="divide-y divide-[var(--border)]">
            {HOTKEY_ACTIONS.filter((a) => a.group === group).map((a) => {
              const active = recording === a.id;
              const issue = issues[a.id];
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">{a.label}</p>
                    {issue && <p className="text-[11px] text-amber-400 truncate" title={issue}>{issue}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void startRecording(a.id)}
                    aria-label={`Change shortcut for ${a.label}`}
                    className={`window-no-drag shrink-0 inline-flex items-center gap-1 h-9 pl-2.5 pr-1.5 rounded-[var(--radius-sm)] border transition-colors ${
                      active
                        ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]"
                        : "border-dashed border-[var(--muted)]/50 hover:border-[var(--text)] hover:bg-[var(--hover)]"
                    }`}
                  >
                    {active ? (
                      <span className="text-[12px] font-semibold text-[var(--brand)] px-1 animate-pulse">
                        Press keys…
                      </span>
                    ) : (
                      <>
                        <Pencil className="w-3.5 h-3.5 text-[var(--muted)] mr-0.5" />
                        <Keycaps accelerator={hotkeys[a.id]} size="sm" />
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="text-[10.5px] text-[var(--muted)] px-0.5">
        Shortcuts work system-wide, so a combination used here won't reach other apps
        {isMac ? " (avoid ⌘C, ⌘V, ⌘Tab…)" : ""}.
      </p>
    </div>
  );
}
