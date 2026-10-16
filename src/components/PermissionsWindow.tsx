import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Mic, Monitor, RotateCw, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useSettingsStore } from "@/stores/settingsStore";

type Perm = "granted" | "denied" | "not-determined";

interface Status {
  screen: Perm;
  microphone: Perm;
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);

/** `tauri dev` — Screen Recording TCC rarely attaches to the debug binary. */
const isDev = import.meta.env.DEV;

export function PermissionsWindow() {
  const theme = useSettingsStore((s) => s.theme);
  const [permissions, setPermissions] = useState<Status>({
    screen: "not-determined",
    microphone: "not-determined",
  });
  const [requestingMic, setRequestingMic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.webview = "permissions";
    document.body.dataset.surface = "overlay";
  }, []);

  useEffect(() => {
    document.body.dataset.surface = "overlay";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.remove("dark", "light");
    root.classList.add(theme === "light" ? "light" : "dark");
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    let primed = false;
    let unlistenGate: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    const refresh = async () => {
      try {
        const status = await invoke<Status>("permissions_status");
        if (mounted) setPermissions(status);
      } catch {
        /* keep last */
      }
    };
    const prime = async () => {
      if (primed || !mounted) return;
      primed = true;
      // Prompt only after this card is showing so the login window cannot
      // cover the macOS dialog. Rust drops always-on-top for the prompt.
      if (isMac) {
        try {
          await invoke("permissions_request_screen");
        } catch {
          /* prompt may already be showing */
        }
      }
      await refresh();
    };
    const win = getCurrentWindow();
    void win.isVisible().then((visible) => {
      if (visible) void prime();
    });
    void win.onFocusChanged(({ payload }) => {
      if (payload) void prime();
    }).then((un) => {
      if (!mounted) un();
      else unlistenFocus = un;
    });
    void listen<string>("gate", (event) => {
      if (event.payload === "permissions") void prime();
    }).then((un) => {
      if (!mounted) un();
      else unlistenGate = un;
    });
    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    return () => {
      mounted = false;
      unlistenGate?.();
      unlistenFocus?.();
      window.clearInterval(id);
    };
  }, []);

  const hasScreen = permissions.screen === "granted";
  const hasMicrophone = isMac
    ? permissions.microphone === "granted"
    : permissions.microphone !== "denied";
  const isReady = hasMicrophone && (!isMac || hasScreen || isDev);
  const requiredCount = isMac ? 2 : 1;
  const grantedCount = (isMac && hasScreen ? 1 : 0) + (hasMicrophone ? 1 : 0);
  const micNeedsSettings = permissions.microphone === "denied";
  const needsRestart = isMac && !hasScreen && !isDev;

  const errText = (e: unknown) =>
    typeof e === "string" ? e : e instanceof Error ? e.message : "Something went wrong";

  const openSettings = async (pane: "screen" | "microphone") => {
    setError(null);
    try {
      await invoke("permissions_open_settings", { pane });
    } catch (e) {
      setError(errText(e));
    }
  };

  const requestMic = async () => {
    if (requestingMic) return;
    setRequestingMic(true);
    setError(null);
    try {
      const status = await invoke<Status>("permissions_request_microphone");
      setPermissions(status);
    } catch (e) {
      setError(errText(e));
    } finally {
      setRequestingMic(false);
    }
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

        <header className="flex items-center justify-center gap-2 window-drag" data-tauri-drag-region>
          <BrandMark size={22} />
          <h1 className="text-[17px] font-semibold tracking-tight">
            {isReady ? "You’re all set" : "Permissions"}
          </h1>
        </header>

        <div className="window-no-drag space-y-2">
          <div className="gate-meter">
            <span style={{ width: `${(grantedCount / requiredCount) * 100}%` }} />
          </div>
          <p className="text-[12px] font-semibold text-[var(--muted)]">
            {grantedCount} of {requiredCount} granted
          </p>
        </div>

        <ul className="window-no-drag space-y-2">
          {isMac && (
            <li className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel)]">
                <Monitor size={16} strokeWidth={1.9} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold">
                  Screen recording <span className="text-[11px] text-[var(--muted)] font-medium">Required</span>
                </p>
                <p className="text-[11.5px] text-[var(--muted)]">
                  Captures screenshots and system audio during the interview.
                </p>
              </div>
              {hasScreen ? (
                <Check size={16} strokeWidth={2.6} className="text-emerald-400" />
              ) : (
                <button
                  type="button"
                  className="shrink-0 h-8 px-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] text-[12px] font-semibold hover:bg-[var(--hover)]"
                  onClick={() => void openSettings("screen")}
                >
                  Open settings
                </button>
              )}
            </li>
          )}
          <li className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel)]">
              <Mic size={16} strokeWidth={1.9} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold">
                Microphone <span className="text-[11px] text-[var(--muted)] font-medium">Required</span>
              </p>
              <p className="text-[11.5px] text-[var(--muted)]">Picks up your voice in conversation mode.</p>
            </div>
            {hasMicrophone ? (
              <Check size={16} strokeWidth={2.6} className="text-emerald-400" />
            ) : micNeedsSettings || !isMac ? (
              <button
                type="button"
                className="shrink-0 h-8 px-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] text-[12px] font-semibold hover:bg-[var(--hover)]"
                onClick={() => void openSettings("microphone")}
              >
                Open settings
              </button>
            ) : (
              <button
                type="button"
                disabled={requestingMic}
                className="shrink-0 h-8 px-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] text-[12px] font-semibold hover:bg-[var(--hover)] disabled:opacity-40"
                onClick={() => void requestMic()}
              >
                Allow
              </button>
            )}
          </li>
        </ul>

        {isMac && !hasScreen && (
          <div className="window-no-drag space-y-1.5">
            <p className="text-[12.5px] font-semibold">How to grant it</p>
            <ol className="list-decimal pl-4 text-[11.5px] text-[var(--muted)] space-y-0.5">
              <li>Click “Open settings”.</li>
              <li>Privacy & Security → Screen & System Audio Recording.</li>
              <li>Enable InterviewVeil (or interviewveil if that is what appears).</li>
              {!isDev && (
                <li>Restart, then launch InterviewVeil again.</li>
              )}
            </ol>
            {isDev && (
              <p className="text-[11.5px] text-[var(--muted)]">
                Local `tauri dev` cannot always receive this grant. Continue is enabled so you can keep working.
              </p>
            )}
          </div>
        )}

        {error && <p className="window-no-drag text-[12px] text-red-400 text-center">{error}</p>}

        <div className="window-no-drag space-y-2">
          {needsRestart ? (
            <button
              type="button"
              className="w-full h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] text-[var(--primary-fg)] text-[13px] font-semibold hover:opacity-90 inline-flex items-center justify-center gap-1.5"
              onClick={() => void invoke("restart_app").catch((e) => setError(errText(e)))}
            >
              <RotateCw size={15} strokeWidth={2.2} />
              Restart InterviewVeil
            </button>
          ) : (
            <button
              type="button"
              disabled={!isReady}
              className="w-full h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] text-[var(--primary-fg)] text-[13px] font-semibold hover:opacity-90 disabled:opacity-40"
              onClick={() => void invoke("enter_overlay")}
            >
              {isReady ? "Continue" : "Waiting for access"}
            </button>
          )}
          {!isReady && (
            <p className="text-[11.5px] text-center text-[var(--muted)]">
              {needsRestart
                ? "Enable it in System Settings first — macOS keeps screen recording off until InterviewVeil relaunches."
                : "Detecting changes automatically — no restart needed"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
