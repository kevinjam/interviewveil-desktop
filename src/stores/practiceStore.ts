import { create } from "zustand";

/**
 * - idle: nothing yet
 * - asking: generating a question
 * - answering: question shown, waiting for the candidate's answer
 * - reviewing: generating feedback
 * - reviewed: feedback shown
 * - tutoring: explaining a screenshot / follow-up (no active question flow)
 */
export type PracticePhase = "idle" | "asking" | "answering" | "reviewing" | "reviewed" | "tutoring";

interface PracticeState {
  phase: PracticePhase;
  question: string;
  /** Candidate's answer: transcribed speech plus anything typed/edited. */
  answer: string;
  /** Coach output (review, explanation or follow-up), streamed. */
  response: string;
  streaming: boolean;
  recording: boolean;
  /** Spoken segments still being transcribed. */
  transcribing: number;
  error: string | null;
  /** Recent questions, so new ones don't repeat. */
  history: string[];
  setPhase: (p: PracticePhase) => void;
  setQuestion: (q: string) => void;
  appendQuestion: (t: string) => void;
  setAnswer: (a: string) => void;
  appendAnswer: (t: string) => void;
  setResponse: (r: string) => void;
  appendResponse: (t: string) => void;
  setStreaming: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  addTranscribing: (delta: number) => void;
  setError: (e: string | null) => void;
  rememberQuestion: (q: string) => void;
  /** Clear the current question, answer and coach output (keeps question history). */
  reset: () => void;
}

export const usePracticeStore = create<PracticeState>((set) => ({
  phase: "idle",
  question: "",
  answer: "",
  response: "",
  streaming: false,
  recording: false,
  transcribing: 0,
  error: null,
  history: [],
  setPhase: (phase) => set({ phase }),
  setQuestion: (question) => set({ question }),
  appendQuestion: (t) => set((s) => ({ question: s.question + t })),
  setAnswer: (answer) => set({ answer }),
  appendAnswer: (t) =>
    set((s) => ({ answer: s.answer ? `${s.answer.trimEnd()} ${t}` : t })),
  setResponse: (response) => set({ response }),
  appendResponse: (t) => set((s) => ({ response: s.response + t })),
  setStreaming: (streaming) => set({ streaming }),
  setRecording: (recording) => set({ recording }),
  addTranscribing: (delta) => set((s) => ({ transcribing: Math.max(0, s.transcribing + delta) })),
  setError: (error) => set({ error }),
  rememberQuestion: (q) => set((s) => ({ history: [...s.history, q].slice(-10) })),
  reset: () =>
    set({ phase: "idle", question: "", answer: "", response: "", error: null, transcribing: 0 }),
}));
