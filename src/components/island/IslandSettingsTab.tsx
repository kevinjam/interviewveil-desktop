import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, Keyboard, Moon, Sun } from "lucide-react";
import { ShortcutsEditor } from "@/components/island/ShortcutsEditor";
import { useSettingsStore } from "@/stores/settingsStore";
import { ANSWER_LANGUAGES, type InterviewMode, type ProgrammingLanguage } from "@/types";

const CODE_LANGS: { id: ProgrammingLanguage; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "csharp", label: "C#" },
];

const TYPES: { id: InterviewMode; label: string }[] = [
  { id: "coding", label: "Programming" },
  { id: "system_design", label: "System design" },
  { id: "behavioral", label: "Behavioral" },
];

const PROMPT_MAX = 1500;

interface Props {
  showShortcuts: boolean;
  onToggleShortcuts: () => void;
}

function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between px-0.5 mb-1">
      <span className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-[var(--muted)]">
        {children}
      </span>
      {right && <span className="text-[10.5px] tabular-nums text-[var(--muted)]">{right}</span>}
    </div>
  );
}

/** Native <select> styled as a dropdown, keeping keyboard + accessibility for free. */
function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="window-no-drag appearance-none w-full h-8 pl-2.5 pr-7 rounded-[var(--radius-sm)] bg-[var(--panel-2)] border border-[var(--border)] text-[12.5px] font-semibold text-[var(--text)] hover:bg-[var(--hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] cursor-pointer truncate"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
    </div>
  );
}

export function IslandSettingsTab({ showShortcuts, onToggleShortcuts }: Props) {
  const s = useSettingsStore();
  const applyOpacity = () => {
    invoke("set_window_opacity", { opacity: s.opacity, window: "chat" }).catch(() => {});
  };

  if (showShortcuts) return <ShortcutsEditor onBack={onToggleShortcuts} />;

  const themeButton = (value: "light" | "dark", Icon: typeof Sun, text: string) => (
    <button
      type="button"
      onClick={() => s.setTheme(value)}
      aria-pressed={s.theme === value}
      className={`window-no-drag flex-1 flex items-center justify-center gap-1.5 h-7 rounded-[7px] text-[12.5px] font-semibold transition-colors ${
        s.theme === value
          ? "bg-[var(--hover)] text-[var(--text)] shadow-[inset_0_0_0_1px_var(--border)]"
          : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {text}
    </button>
  );

  return (
    <div className="px-3 pt-2 pb-1 space-y-3">
      <section>
        <Label>Appearance</Label>
        <div className="flex gap-1 p-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel-2)]">
          {themeButton("light", Sun, "Light")}
          {themeButton("dark", Moon, "Dark")}
        </div>
      </section>

      <section>
        <Label right={`${Math.round(s.opacity * 100)}%`}>Chat opacity</Label>
        <input
          type="range"
          aria-label="Chat opacity"
          min={0.2}
          max={1}
          step={0.01}
          value={s.opacity}
          onChange={(e) => s.setOpacity(Number(e.target.value))}
          onMouseUp={applyOpacity}
          onKeyUp={applyOpacity}
          onTouchEnd={applyOpacity}
          className="island-range window-no-drag"
          style={{ "--fill": `${((s.opacity - 0.2) / 0.8) * 100}%` } as React.CSSProperties}
        />
      </section>

      <section className="grid grid-cols-[1fr_1.35fr_1fr] gap-2">
        <div className="min-w-0">
          <Label>Language</Label>
          <Select
            label="Answer language"
            value={s.answerLanguage}
            options={ANSWER_LANGUAGES.map((l) => ({ id: l, label: l }))}
            onChange={s.setAnswerLanguage}
          />
        </div>
        <div className="min-w-0">
          <Label>Type</Label>
          <Select label="Interview type" value={s.mode} options={TYPES} onChange={s.setMode} />
        </div>
        <div className="min-w-0">
          <Label>Code</Label>
          <Select label="Programming language" value={s.language} options={CODE_LANGS} onChange={s.setLanguage} />
        </div>
      </section>

      <section>
        <Label right={`${s.customPrompt.length}/${PROMPT_MAX}`}>Additional prompt</Label>
        <textarea
          value={s.customPrompt}
          onChange={(e) => s.setCustomPrompt(e.target.value.slice(0, PROMPT_MAX))}
          rows={2}
          placeholder="Add custom instructions for the model…"
          className="window-no-drag w-full px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--panel-2)] border border-[var(--border)] text-[12.5px] text-[var(--text)] placeholder:text-[var(--muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </section>

      <button
        type="button"
        onClick={onToggleShortcuts}
        className="window-no-drag w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel-2)] hover:bg-[var(--hover)] text-left transition-colors"
      >
        <span className="grid place-items-center w-7 h-7 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--panel)]">
          <Keyboard className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold">Edit shortcuts</span>
          <span className="block text-[11.5px] text-[var(--muted)]">Rebind any keyboard shortcut</span>
        </span>
        <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
      </button>
    </div>
  );
}
