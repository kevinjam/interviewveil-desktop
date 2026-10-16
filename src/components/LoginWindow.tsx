import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { openWebPage, signInWithBrowser } from "@/lib/account";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function LoginWindow() {
  const token = useAuthStore((s) => s.token);
  const theme = useSettingsStore((s) => s.theme);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.dataset.webview = "login";
    document.body.dataset.surface = "overlay";
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return () => {
      unsub();
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    document.body.dataset.surface = "overlay";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.remove("dark", "light");
    root.classList.add(theme === "light" ? "light" : "dark");
  }, [theme]);

  useEffect(() => {
    if (!hydrated) return;
    if (token) {
      void invoke("advance_after_auth").catch(() => {});
    } else {
      void invoke("show_login").catch(() => {});
    }
  }, [hydrated, token]);

  const start = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setCode(null);
    try {
      await signInWithBrowser(setCode, controller.signal);
      await invoke("advance_after_auth");
    } catch (e) {
      if (!controller.signal.aborted) setError(errText(e));
    } finally {
      if (abort.current === controller) {
        setBusy(false);
        setCode(null);
      }
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setBusy(false);
    setCode(null);
  };

  return (
    <div className="h-full flex flex-col bg-transparent">
      <div className="gate-card">
        <div className="gate-drag window-drag" data-tauri-drag-region />
        <button
          type="button"
          className="gate-quit window-no-drag"
          title="Quit InterviewVeil"
          onClick={() => invoke("quit_app")}
        >
          <X size={14} strokeWidth={2.4} />
        </button>

        <div className="flex items-center justify-center gap-2 window-drag" data-tauri-drag-region>
          <BrandMark size={22} />
          <h1 className="text-[17px] font-semibold tracking-tight">InterviewVeil</h1>
        </div>

        {code ? (
          <div className="window-no-drag space-y-3">
            <p className="text-[12.5px] text-center text-[var(--muted)]">Continue in your browser</p>
            <p className="text-center font-mono text-[22px] font-bold tracking-[0.18em] py-2.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--panel-2)]">
              {code}
            </p>
            <p className="flex items-center justify-center gap-1.5 text-[12px] text-[var(--muted)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for confirmation…
            </p>
            <button
              type="button"
              onClick={cancel}
              className="w-full h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel-2)] text-[12.5px] font-semibold hover:bg-[var(--hover)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="window-no-drag flex flex-col gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void start()}
              className="w-full h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] text-[var(--primary-fg)] text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Sign in with browser
            </button>
            <p className="text-center text-[12px] text-[var(--muted)]">
              New here?{" "}
              <button
                type="button"
                onClick={() => void openWebPage("/signup")}
                className="font-semibold text-[var(--brand)] hover:underline"
              >
                Create a free account
              </button>
            </p>
          </div>
        )}

        {error && <p className="window-no-drag text-[12px] text-red-400 text-center">{error}</p>}
      </div>
    </div>
  );
}
