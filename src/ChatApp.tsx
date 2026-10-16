import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChatWindow } from "@/components/ChatWindow";
import { PracticeView } from "@/components/PracticeView";
import { ScreenshotStrip } from "@/components/ScreenshotStrip";
import { useAppActions } from "@/hooks/useAppActions";
import { useFitChatHeight } from "@/hooks/useFitChatHeight";
import { usePractice } from "@/hooks/usePractice";
import { useScreenshot } from "@/hooks/useScreenshot";
import { refreshAccount } from "@/lib/account";
import { refreshServerConfig } from "@/stores/serverConfigStore";
import { useExitOverlayWhenSignedOut } from "@/hooks/useExitOverlayWhenSignedOut";
import { useAuthStore } from "@/stores/authStore";
import { usePracticeStore } from "@/stores/practiceStore";
import { MAX_SCREENSHOTS, useScreenshotStore } from "@/stores/screenshotStore";
import type { HotkeyIssue } from "@/components/island/ShortcutsEditor";
import { useSettingsStore } from "@/stores/settingsStore";

export default function ChatApp() {
  const theme = useSettingsStore((s) => s.theme);
  const opacity = useSettingsStore((s) => s.opacity);
  const hotkeys = useSettingsStore((s) => s.hotkeys);
  const token = useAuthStore((s) => s.token);
  useExitOverlayWhenSignedOut();
  const { newQuestion, toggleRecording, submitAnswer, sendScreenshots } = usePractice();
  const { capture } = useScreenshot();
  const response = usePracticeStore((s) => s.response);
  const streaming = usePracticeStore((s) => s.streaming);
  const question = usePracticeStore((s) => s.question);
  const error = usePracticeStore((s) => s.error);
  const recording = usePracticeStore((s) => s.recording);
  const transcribing = usePracticeStore((s) => s.transcribing);
  const queued = useScreenshotStore((s) => s.items.length);
  useFitChatHeight([response, streaming, question, error, recording, transcribing, queued]);

  useEffect(() => {
    document.body.dataset.surface = "overlay";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.remove("dark", "light");
    root.classList.add(theme === "light" ? "light" : "dark");
    invoke("set_window_opacity", { opacity, window: "chat" }).catch(() => {});
    invoke("refresh_capture_exclusion").catch(() => {});
  }, [theme, opacity]);

  useEffect(() => {
    void refreshAccount();
    void refreshServerConfig();
  }, [token]);

  const onCapture = useCallback(async () => {
    try {
      const shot = await capture();
      if (!shot) {
        usePracticeStore
          .getState()
          .setError(`You already have ${MAX_SCREENSHOTS} screenshots — send or clear them.`);
      }
    } catch (e) {
      usePracticeStore
        .getState()
        .setError(typeof e === "string" ? e : e instanceof Error ? e.message : "Screenshot capture failed");
    }
  }, [capture]);

  const onSend = useCallback(() => {
    void sendScreenshots();
  }, [sendScreenshots]);

  const onClearAnswers = useCallback(() => {
    if (!usePracticeStore.getState().streaming) usePracticeStore.getState().reset();
  }, []);

  // Apply the user's saved shortcuts once signed in (Rust ignores this until overlay).
  const hotkeysJson = JSON.stringify(hotkeys);
  useEffect(() => {
    if (!token) return;
    invoke<HotkeyIssue[]>("update_hotkeys", { config: JSON.parse(hotkeysJson) }).catch(() => {});
  }, [hotkeysJson, token]);

  const scrollChat = (dy: number) =>
    document.getElementById("practice-scroll")?.scrollBy({ top: dy, behavior: "smooth" });

  useAppActions({
    explain_screen: () => void onCapture(),
    send_screenshots: onSend,
    new_question: newQuestion,
    record: () => void toggleRecording(),
    submit_answer: () => {
      if (usePracticeStore.getState().phase === "answering") void submitAnswer();
    },
    clear_screenshots: () => useScreenshotStore.getState().clear(),
    scroll_up: () => scrollChat(-240),
    scroll_down: () => scrollChat(240),
    clear_chat: onClearAnswers,
    toggle_visibility: () => void invoke("toggle_window_visibility").catch(() => {}),
  });

  return (
    <div className="h-full flex flex-col bg-transparent">
      <ScreenshotStrip />
      <ChatWindow>
        <PracticeView
          hotkeys={hotkeys}
          onCapture={() => void onCapture()}
          onSend={onSend}
          onListen={() => void toggleRecording()}
          onClear={onClearAnswers}
        />
      </ChatWindow>
    </div>
  );
}
