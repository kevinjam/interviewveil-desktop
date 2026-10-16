import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_HOTKEYS, type HotkeySettings } from "@/lib/hotkeys";
import type { AnswerLanguage, InterviewMode, ProgrammingLanguage } from "@/types";

export type { HotkeySettings };

interface SettingsState {
  theme: "dark" | "light";
  opacity: number;
  /** Language the coach writes in. */
  answerLanguage: AnswerLanguage;
  /** Programming language for code. */
  language: ProgrammingLanguage;
  mode: InterviewMode;
  customPrompt: string;
  hotkeys: HotkeySettings;
  setTheme: (t: "dark" | "light") => void;
  setOpacity: (o: number) => void;
  setAnswerLanguage: (l: AnswerLanguage) => void;
  setLanguage: (l: ProgrammingLanguage) => void;
  setMode: (m: InterviewMode) => void;
  setCustomPrompt: (p: string) => void;
  setHotkeys: (h: HotkeySettings) => void;
}

const STORAGE_KEY = "interviewveil-settings";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      opacity: 0.8,
      answerLanguage: "English",
      language: "python",
      mode: "coding",
      customPrompt: "",
      hotkeys: DEFAULT_HOTKEYS,
      setTheme: (theme) => set({ theme }),
      setOpacity: (opacity) => set({ opacity }),
      setAnswerLanguage: (answerLanguage) => set({ answerLanguage }),
      setLanguage: (language) => set({ language }),
      setMode: (mode) => set({ mode }),
      setCustomPrompt: (customPrompt) => set({ customPrompt }),
      setHotkeys: (hotkeys) => set({ hotkeys }),
    }),
    {
      name: STORAGE_KEY,
      version: 6,
      // Older versions stored API keys, billing state and server-controlled
      // choices (model, difficulty) here; drop them, keep preferences.
      // Fill in defaults for shortcut actions added after the user's settings were saved.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p, hotkeys: { ...DEFAULT_HOTKEYS, ...p.hotkeys } };
      },
      migrate: (old, version) => {
        const o = { ...(old as Record<string, unknown>) };
        for (const k of [
          "claudeApiKey", "grokApiKey", "sttApiKey", "sttBaseUrl", "sttModel",
          "provider", "useProxy", "proxyBaseUrl", "installId", "account",
          "claudeModel", "difficulty",
        ]) {
          delete o[k];
        }
        // v5 reorganised shortcuts into named actions; start from the new defaults.
        if (version < 5) delete o.hotkeys;
        // v6: Cmd+arrows snap the answer panel (was Cmd+Alt+arrows). Keep any
        // custom binding the user already chose.
        if (version < 6) {
          const hk = o.hotkeys as Record<string, string> | undefined;
          if (hk) {
            if (hk.move_chat_left === "CommandOrControl+Alt+Left") {
              hk.move_chat_left = "CommandOrControl+Left";
            }
            if (hk.move_chat_right === "CommandOrControl+Alt+Right") {
              hk.move_chat_right = "CommandOrControl+Right";
            }
          }
        }
        return o as unknown as SettingsState;
      },
    },
  ),
);

// The island and chat windows are separate webviews sharing one localStorage.
// Re-read persisted settings whenever the other window writes them.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      void useSettingsStore.persist.rehydrate();
    }
  });
}
