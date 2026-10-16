import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CreditCard, Home, Settings, User } from "lucide-react";
import { IslandNavBar, type IslandTab } from "@/components/island/IslandNavBar";
import { IslandStatusPill } from "@/components/island/IslandStatusPill";
import { IslandHomeTab } from "@/components/island/IslandHomeTab";
import { IslandSettingsTab } from "@/components/island/IslandSettingsTab";
import { IslandPlansTab } from "@/components/island/IslandPlansTab";
import { IslandProfileTab } from "@/components/island/IslandProfileTab";
import { BrandMark } from "@/components/BrandMark";
import { useExitOverlayWhenSignedOut } from "@/hooks/useExitOverlayWhenSignedOut";
import { useSettingsStore } from "@/stores/settingsStore";
import "@/styles/island.css";

const TABS = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "settings" as const, label: "Settings", icon: Settings },
  { id: "plans" as const, label: "Plans", icon: CreditCard },
  { id: "profile" as const, label: "Profile", icon: User },
];

const PANEL_MAX_H = 460;

function isTextEntry(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable
  );
}

export default function IslandApp() {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<IslandTab>("home");
  const [showShortcutEditor, setShowShortcutEditor] = useState(false);
  const [recording, setRecording] = useState(false);
  const [queued, setQueued] = useState(0);
  const [interactable, setInteractable] = useState(true);

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  const settings = useSettingsStore();
  useExitOverlayWhenSignedOut();

  const openMenu = useCallback((nextTab?: IslandTab) => {
    if (nextTab) setTab(nextTab);
    setExpanded(true);
    invoke("island_expand").catch(() => {});
    invoke("bring_island_front").catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.webview = "island";
    document.body.dataset.surface = "overlay";
    listen<boolean>("recording-changed", (e) => {
      setRecording(Boolean(e.payload));
    }).catch(() => {});

    listen<number>("screenshots-changed", (e) => {
      setQueued(Number(e.payload) || 0);
    }).catch(() => {});

    listen<boolean>("island:expanded", (e) => {
      setExpanded(Boolean(e.payload));
    }).catch(() => {});

    listen<boolean>("interactability-changed", (e) => {
      setInteractable(e.payload !== false);
    }).catch(() => {});

    invoke<boolean>("overlay_interactable")
      .then((value) => setInteractable(value !== false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.dataset.surface = "overlay";
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.classList.remove("dark", "light");
    root.classList.add(settings.theme === "light" ? "light" : "dark");
    invoke("refresh_capture_exclusion").catch(() => {});
  }, [settings.theme]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!panel || !root) return;

    const apply = () => {
      const height = Math.min(Math.ceil(panel.scrollHeight), PANEL_MAX_H);
      root.style.setProperty("--island-h", `${height}px`);
      invoke("island_report_panel_height", { height }).catch(() => {});
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(panel);
    return () => ro.disconnect();
  }, [tab, showShortcutEditor, expanded]);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const root = rootRef.current;
    if (!pill || !root) return;

    const apply = () => {
      const width = Math.max(260, Math.min(660, Math.ceil(pill.offsetWidth)));
      root.style.setProperty("--pill-w", `${width}px`);
      invoke("island_report_pill_width", { width }).catch(() => {});
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(pill);
    return () => ro.disconnect();
  }, [recording, queued, interactable]);

  /** Run a Home action: collapse the menu first so it isn't in the way (or in screenshots). */
  const dispatch = async (action: string) => {
    setExpanded(false);
    await invoke("island_collapse").catch(() => {});
    if (action === "explain_screen") await new Promise((r) => setTimeout(r, 180)); // let it animate away
    invoke("dispatch_app_action", { action }).catch(() => {});
  };

  const lockIsland = (locked: boolean) => {
    invoke("island_set_locked", { locked }).catch(() => {});
  };

  const onSelectTab = (id: IslandTab) => {
    openMenu(id);
    setShowShortcutEditor(false);
  };

  return (
    <div
      className="island-root pointer-events-none"
      ref={rootRef}
      data-expanded={expanded ? "true" : "false"}
    >
      <div
        className="island-shell pointer-events-auto"
        data-expanded={expanded ? "true" : "false"}
        onMouseEnter={() => {
          if (!expanded) openMenu();
        }}
      >
        <button
          type="button"
          className="island-pill-layer window-no-drag"
          onClick={() => openMenu()}
          aria-expanded={expanded}
          aria-label="Open InterviewVeil menu"
        >
          <IslandStatusPill
            pillRef={pillRef}
            recording={recording}
            queued={queued}
            interactable={interactable}
            hotkeys={settings.hotkeys}
          />
        </button>

        <div
          ref={panelRef}
          className="island-panel-layer window-no-drag"
          onFocusCapture={(e) => {
            if (isTextEntry(e.target)) lockIsland(true);
          }}
          onBlurCapture={() => lockIsland(false)}
        >
          <IslandNavBar
            tabs={TABS}
            active={tab}
            onSelect={onSelectTab}
            onQuit={() => invoke("quit_app")}
          />
          <div className="island-rule" />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "home" && (
              <IslandHomeTab
                hotkeys={settings.hotkeys}
                onAction={(a) => void dispatch(a)}
                onEditShortcuts={() => {
                  openMenu("settings");
                  setShowShortcutEditor(true);
                }}
              />
            )}
            {tab === "settings" && (
              <IslandSettingsTab
                showShortcuts={showShortcutEditor}
                onToggleShortcuts={() => setShowShortcutEditor((v) => !v)}
              />
            )}
            {tab === "plans" && <IslandPlansTab onSignIn={() => openMenu("profile")} />}
            {tab === "profile" && <IslandProfileTab onShowPlans={() => openMenu("plans")} />}
          </div>

          <footer className="island-footer">
            <span className="inline-flex items-center gap-1.5">
              <BrandMark size={12} />
              InterviewVeil
            </span>
            <span>v0.1.0</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
