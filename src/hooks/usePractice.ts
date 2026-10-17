import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { streamAnswer } from "@/lib/ai";
import { refreshAccount } from "@/lib/account";
import {
  questionSystemPrompt,
  reviewSystemPrompt,
  tutorSystemPrompt,
  type PromptSettings,
} from "@/lib/prompts";
import { isMeaningfulTranscript, transcribe } from "@/lib/transcribe";
import { usePracticeStore } from "@/stores/practiceStore";
import { useAuthStore } from "@/stores/authStore";
import { useServerConfigStore } from "@/stores/serverConfigStore";
import type { StreamImage, StreamRequest } from "@/lib/ai/claude";
import { useSettingsStore } from "@/stores/settingsStore";
import { useScreenshotStore } from "@/stores/screenshotStore";

interface ScreenshotAiPayload {
  dataBase64: string;
  mime: string;
}

/** Payload of the Rust `audio-segment` event. */
interface AudioSegment {
  wav_base64: string;
  duration_ms: number;
  ended_at: number;
}

function promptSettings(): PromptSettings {
  const s = useSettingsStore.getState();
  return {
    mode: s.mode,
    language: s.language,
    difficulty: useServerConfigStore.getState().difficulty,
    answerLanguage: s.answerLanguage,
    customPrompt: s.customPrompt,
  };
}

/** Why the user can't make a hosted request right now, or null if they can. */
function blockedReason(kind: "tokens" | "audio"): string | null {
  const { token, account } = useAuthStore.getState();
  if (!token) return "Sign in from the InterviewVeil menu (Profile) to start.";
  if (kind === "audio" && (account?.audioSecondsLeft ?? 0) <= 0) {
    return "You have no listening time left. Upgrade in Plans or wait for your monthly reset.";
  }
  if (kind === "tokens" && account?.tokensLeft === 0) {
    return "You're out of tokens. Upgrade in Plans or wait for your monthly reset.";
  }
  return null;
}

/** Stream one model call into `onDelta`; returns the full text, or null on error. */
async function runModel(
  kind: StreamRequest["kind"],
  system: string,
  userMessage: string,
  onDelta: (t: string) => void,
  images?: StreamImage[],
): Promise<string | null> {
  const practice = usePracticeStore.getState();

  const blocked = blockedReason("tokens");
  if (blocked) {
    practice.setError(blocked);
    return null;
  }

  practice.setError(null);
  practice.setStreaming(true);
  try {
    return await streamAnswer({
      plan: useAuthStore.getState().account?.plan ?? "free",
      kind,
      mode: useSettingsStore.getState().mode,
      system,
      userMessage,
      images,
      onDelta,
    });
  } catch (e) {
    practice.setError(e instanceof Error ? e.message : "AI request failed");
    return null;
  } finally {
    usePracticeStore.getState().setStreaming(false);
    void refreshAccount();
  }
}

const listenQueue: string[] = [];
let listenBusy = false;

async function drainListenQueue() {
  if (listenBusy) return;
  listenBusy = true;
  while (listenQueue.length > 0) {
    const text = listenQueue.shift();
    if (!text) continue;
    const p = usePracticeStore.getState();
    p.setPhase("tutoring");
    let started = false;
    await runModel(
      "follow_up",
      tutorSystemPrompt(promptSettings()),
      `The interviewer said:\n${text}`,
      (t) => {
        const store = usePracticeStore.getState();
        if (!started) {
          started = true;
          if (store.response) store.appendResponse("\n\n");
        }
        store.appendResponse(t);
      },
    );
  }
  listenBusy = false;
}

async function transcribeSegment(seg: AudioSegment) {
  const practice = usePracticeStore.getState();

  const blocked = blockedReason("audio");
  if (blocked) {
    practice.setError(blocked);
    return;
  }

  practice.addTranscribing(1);
  try {
    const text = await transcribe({
      wavBase64: seg.wav_base64,
      prompt: `${usePracticeStore.getState().response}\n${usePracticeStore.getState().question}`,
    });
    if (!isMeaningfulTranscript(text)) return;

    // Legacy mock-interview path still types into the answer box.
    const phase = usePracticeStore.getState().phase;
    if (phase === "answering" || phase === "reviewing") {
      usePracticeStore.getState().appendAnswer(text);
      return;
    }

    listenQueue.push(text);
    void drainListenQueue();
  } catch (e) {
    usePracticeStore.getState().setError(e instanceof Error ? e.message : "Transcription failed");
  } finally {
    usePracticeStore.getState().addTranscribing(-1);
    void refreshAccount();
  }
}

export function usePractice() {
  useEffect(() => {
    const unlisteners = [
      listen<AudioSegment>("audio-segment", (e) => void transcribeSegment(e.payload)),
      listen<boolean>("recording-changed", (e) =>
        usePracticeStore.getState().setRecording(Boolean(e.payload)),
      ),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, []);

  const stopRecording = useCallback(async () => {
    if (!usePracticeStore.getState().recording) return;
    await invoke("stop_recording").catch(() => {});
    usePracticeStore.getState().setRecording(false);
  }, []);

  const newQuestion = useCallback(async () => {
    await stopRecording();
    const p = usePracticeStore.getState();
    p.setQuestion("");
    p.setAnswer("");
    p.setResponse("");
    p.setPhase("asking");

    const avoid = p.history.length
      ? `\n\nDo not repeat any of these recent questions:\n${p.history.map((q) => `- ${q.slice(0, 160)}`).join("\n")}`
      : "";
    const full = await runModel(
      "question",
      questionSystemPrompt(promptSettings()),
      `Give me a new practice question.${avoid}`,
      (t) => usePracticeStore.getState().appendQuestion(t),
    );
    const s = usePracticeStore.getState();
    if (full === null) {
      s.setPhase("idle");
      return;
    }
    s.rememberQuestion(full.replace(/^#+\s*Question\s*/i, "").trim());
    s.setPhase("answering");
  }, [stopRecording]);

  const toggleRecording = useCallback(async () => {
    const p = usePracticeStore.getState();
    if (p.recording) {
      await stopRecording();
      const s = usePracticeStore.getState();
      if (!s.response && s.phase === "tutoring") s.setPhase("idle");
      return;
    }
    const blocked = blockedReason("audio");
    if (blocked) {
      p.setError(blocked);
      return;
    }
    try {
      await invoke("start_recording");
      p.setRecording(true);
      p.setError(null);
      if (p.phase === "idle") p.setPhase("tutoring");
    } catch (e) {
      p.setError(
        typeof e === "string" ? e : e instanceof Error ? e.message : "Microphone permission required",
      );
    }
  }, [stopRecording]);

  const submitAnswer = useCallback(async () => {
    await stopRecording();
    const p = usePracticeStore.getState();
    for (let i = 0; i < 20 && usePracticeStore.getState().transcribing > 0; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const answer = usePracticeStore.getState().answer.trim();
    if (!answer) {
      p.setError("Record or type an answer first.");
      return;
    }
    p.setResponse("");
    p.setPhase("reviewing");
    const question = p.question.trim() || "(The candidate chose their own question; infer it from the answer.)";
    const full = await runModel(
      "review",
      reviewSystemPrompt(promptSettings()),
      `<question>\n${question}\n</question>\n\n<candidate_answer>\n${answer}\n</candidate_answer>`,
      (t) => usePracticeStore.getState().appendResponse(t),
    );
    usePracticeStore.getState().setPhase(full === null ? "answering" : "reviewed");
  }, [stopRecording]);

  const sendScreenshots = useCallback(async () => {
    const p = usePracticeStore.getState();
    if (p.recording || p.streaming) return;
    const shots = useScreenshotStore.getState().items;
    if (shots.length === 0) {
      p.setError("Capture a screenshot first, then send.");
      return;
    }
    // Tech Screen: load AI JPEGs from disk only when sending (capture keeps thumbs only).
    let images: ScreenshotAiPayload[];
    try {
      images = await invoke<ScreenshotAiPayload[]>("read_screenshots_for_ai", {
        paths: shots.map((s) => s.filePath),
      });
    } catch (e) {
      p.setError(typeof e === "string" ? e : e instanceof Error ? e.message : "Failed to read screenshots.");
      return;
    }
    if (images.length === 0) {
      p.setError("Failed to read screenshot data. Capture again, then send.");
      return;
    }
    p.setResponse("");
    p.setPhase("tutoring");
    let cleared = false;
    const n = images.length;
    await runModel(
      "explain",
      tutorSystemPrompt(promptSettings()),
      n === 1
        ? "Solve or explain the interview question shown in this screenshot."
        : `Solve or explain the interview question shown in these ${n} screenshots.`,
      (t) => {
        if (!cleared) {
          cleared = true;
          useScreenshotStore.getState().clear();
        }
        usePracticeStore.getState().appendResponse(t);
      },
      images.map((img) => ({ dataBase64: img.dataBase64, mime: img.mime || "image/jpeg" })),
    );
  }, []);

  return { newQuestion, toggleRecording, submitAnswer, sendScreenshots };
}
