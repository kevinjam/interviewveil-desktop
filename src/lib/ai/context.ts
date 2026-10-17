import type { AnswerLanguage, InterviewMode, ProgrammingLanguage } from "@/types";

/** Sent to the API via headers; the server builds the system prompt for live assist. */
export interface LiveAssistContext {
  mode: InterviewMode;
  language: ProgrammingLanguage;
  answerLanguage: AnswerLanguage;
  customPrompt: string;
}

export function liveAssistHeaders(ctx: LiveAssistContext): Record<string, string> {
  const headers: Record<string, string> = {
    "x-interviewveil-mode": ctx.mode,
    "x-interviewveil-language": ctx.language,
    "x-interviewveil-answer-language": ctx.answerLanguage,
  };
  const extra = ctx.customPrompt.trim();
  if (extra) headers["x-interviewveil-custom-prompt"] = extra.slice(0, 1500);
  return headers;
}
