import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ChatQuickActions } from "@/components/ChatQuickActions";
import { SectionsView } from "@/components/SectionsView";
import { usePracticeStore } from "@/stores/practiceStore";
import { useScreenshotStore } from "@/stores/screenshotStore";
import type { HotkeySettings } from "@/stores/settingsStore";

interface Props {
  hotkeys: HotkeySettings;
  onCapture: () => void;
  onSend: () => void;
  onListen: () => void;
  onClear: () => void;
}

export function PracticeView({ hotkeys, onCapture, onSend, onListen, onClear }: Props) {
  const p = usePracticeStore();
  const queued = useScreenshotStore((s) => s.items.length);
  const empty = !p.response && !p.streaming && !p.error && !p.recording && !p.question;

  useEffect(() => {
    const el = document.getElementById("practice-scroll");
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: p.streaming ? "auto" : "smooth" });
  }, [p.response, p.streaming, p.question, p.error]);

  if (empty) {
    return (
      <div
        id="practice-body"
        className="flex flex-col items-center justify-center gap-4 min-h-[150px] px-4 py-3 text-center"
      >
        <div className="flex flex-col items-center gap-1.5 max-w-[360px]">
          <strong className="text-[13.5px] font-semibold tracking-tight text-[var(--text)]">
            Ready when you are
          </strong>
          <small className="text-[11.5px] leading-snug text-[var(--muted)]">
            Answers land here — capture a question or let InterviewVeil listen in.
          </small>
        </div>
        <ChatQuickActions
          hotkeys={hotkeys}
          queued={queued}
          onCapture={onCapture}
          onSend={onSend}
          onListen={onListen}
        />
      </div>
    );
  }

  return (
    <div
      id="practice-scroll"
      className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-3.5 text-[13.5px] leading-relaxed"
    >
      <div id="practice-body" className="space-y-4">
      {p.error && (
        <div className="p-3 text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-[var(--radius-sm)]">
          {p.error}
        </div>
      )}

      {(p.streaming || p.recording || p.transcribing > 0) && (
        <div className="flex items-center gap-2 text-[var(--brand)] text-xs font-medium">
          {p.streaming ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
          {p.streaming
            ? "Generating answer"
            : p.transcribing > 0
              ? "Transcribing…"
              : "Listening"}
        </div>
      )}

      {p.question && p.phase !== "tutoring" && <SectionsView raw={p.question} />}

      {p.response && <SectionsView raw={p.response} />}

      {p.response && !p.streaming && (
        <button
          type="button"
          onClick={onClear}
          className="window-no-drag text-[12px] font-semibold text-[var(--brand)] hover:underline"
        >
          Clear
        </button>
      )}
      </div>
    </div>
  );
}
